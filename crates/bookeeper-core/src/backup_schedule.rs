//! Scheduled automatic backups with rotation (design §6.5).
//!
//! Files: `backups_dir/<library_id>/auto-<YYYYMMDD-HHMMSS>.zip`, written as `.tmp` first.
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::backup::{self, BackupError};
use crate::state::{AppState, Files};

pub const DEFAULT_INTERVAL_DAYS: u32 = 3;
pub const DEFAULT_KEEP: u32 = 5;
pub const MAX_INTERVAL_DAYS: u32 = 90;
pub const MAX_KEEP: u32 = 50;
const STALE_TMP_SECS: i64 = 3600;
const TICK: Duration = Duration::from_secs(3600);
const PREFIX: &str = "auto-";
const STAMP_FORMAT: &str = "%Y%m%d-%H%M%S";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct BackupConfig {
    pub interval_days: u32,
    pub keep: u32,
}

impl Default for BackupConfig {
    fn default() -> Self {
        BackupConfig {
            interval_days: DEFAULT_INTERVAL_DAYS,
            keep: DEFAULT_KEEP,
        }
    }
}

impl BackupConfig {
    pub fn is_valid(&self) -> bool {
        self.interval_days <= MAX_INTERVAL_DAYS && (1..=MAX_KEEP).contains(&self.keep)
    }
}

fn config_key(library_id: &str) -> String {
    format!("backup_config:{library_id}")
}

/// Effective configuration: the stored one, or the default when missing or unreadable.
pub fn load_config(conn: &Connection, library_id: &str) -> rusqlite::Result<BackupConfig> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM server_meta WHERE key = ?1",
            [config_key(library_id)],
            |r| r.get(0),
        )
        .optional()?;
    Ok(raw
        .and_then(|s| serde_json::from_str::<BackupConfig>(&s).ok())
        .filter(BackupConfig::is_valid)
        .unwrap_or_default())
}

pub fn save_config(
    conn: &Connection,
    library_id: &str,
    cfg: &BackupConfig,
) -> rusqlite::Result<()> {
    let json = serde_json::to_string(cfg).unwrap_or_default();
    conn.execute(
        "INSERT OR REPLACE INTO server_meta (key, value) VALUES (?1, ?2)",
        params![config_key(library_id), json],
    )?;
    Ok(())
}

/// A finished automatic backup on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutoBackup {
    pub name: String,
    pub created_at: i64,
    pub size_bytes: u64,
}

fn file_name(at: i64) -> String {
    let stamp = DateTime::from_timestamp(at, 0)
        .unwrap_or_default()
        .format(STAMP_FORMAT);
    format!("{PREFIX}{stamp}.zip")
}

fn parse_name(name: &str) -> Option<i64> {
    let stamp = name.strip_prefix(PREFIX)?.strip_suffix(".zip")?;
    NaiveDateTime::parse_from_str(stamp, STAMP_FORMAT)
        .ok()
        .map(|d| d.and_utc().timestamp())
}

fn library_dir(files: &Files, library_id: &str) -> PathBuf {
    files.backups_dir.join(library_id)
}

/// Automatic backups of a library, newest first. A missing folder is an empty list.
pub fn list_auto(files: &Files, library_id: &str) -> std::io::Result<Vec<AutoBackup>> {
    let dir = library_dir(files, library_id);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(created_at) = parse_name(&name) else {
            continue;
        };
        let meta = entry.metadata()?;
        if !meta.is_file() {
            continue;
        }
        out.push(AutoBackup {
            name,
            created_at,
            size_bytes: meta.len(),
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.name.cmp(&a.name)));
    Ok(out)
}

/// Backups dated further than this past `now` are not trusted (clock skew tolerance).
const FUTURE_SLACK_SECS: i64 = 300;

/// Drops backups dated in the future: they must not decide "due" nor push real ones out
/// of the rotation. They stay on disk and in `list_auto`.
fn trusted(list: Vec<AutoBackup>, now: i64) -> Vec<AutoBackup> {
    list.into_iter()
        .filter(|b| b.created_at <= now + FUTURE_SLACK_SECS)
        .collect()
}

fn in_flight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(Default::default)
}

/// Per-library lock: held while a library is being backed up.
struct LibraryLock(String);

impl LibraryLock {
    fn try_acquire(library_id: &str) -> Option<LibraryLock> {
        let mut set = in_flight().lock().unwrap_or_else(|p| p.into_inner());
        set.insert(library_id.to_string())
            .then(|| LibraryLock(library_id.to_string()))
    }
}

impl Drop for LibraryLock {
    fn drop(&mut self) {
        in_flight()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&self.0);
    }
}

#[derive(Debug, thiserror::Error)]
enum RunError {
    #[error("{0}")]
    Db(#[from] crate::db::DbError),
    #[error("{0}")]
    Backup(#[from] BackupError),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Task(String),
}

/// One round: for every library with automatic backups on, create a backup when the
/// newest one is older than `interval_days` (or missing), then rotate. Returns how many
/// backups were created.
pub async fn run_once(state: &AppState, now: i64) -> usize {
    let libs = state
        .db
        .run(|conn| {
            let mut stmt = conn.prepare("SELECT id FROM libraries ORDER BY id")?;
            let ids = stmt.query_map([], |r| r.get::<_, String>(0))?;
            ids.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await;
    let libs = match libs {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(error = %e, "scheduled backup: cannot list libraries");
            return 0;
        }
    };
    let mut created = 0;
    for id in libs {
        match backup_library(state, &id, now).await {
            Ok(true) => created += 1,
            Ok(false) => {}
            Err(e) => tracing::error!(library = %id, error = %e, "scheduled backup failed"),
        }
    }
    created
}

async fn backup_library(state: &AppState, library_id: &str, now: i64) -> Result<bool, RunError> {
    let Some(_lock) = LibraryLock::try_acquire(library_id) else {
        return Ok(false);
    };
    let lib = library_id.to_string();
    let cfg = state.db.run(move |c| load_config(c, &lib)).await?;
    if cfg.interval_days == 0 {
        return Ok(false);
    }
    let files = state.files.clone();
    let lib = library_id.to_string();
    let interval = i64::from(cfg.interval_days) * 86_400;

    // Disk work off the async runtime: stale tmp cleanup and the "is it due" check.
    let due = {
        let (files, lib) = (files.clone(), lib.clone());
        blocking(move || -> Result<bool, RunError> {
            let dir = library_dir(&files, &lib);
            if dir.is_dir() {
                remove_stale_tmp(&dir, now);
            }
            let newest = trusted(list_auto(&files, &lib)?, now)
                .first()
                .map(|b| b.created_at);
            Ok(newest.is_none_or(|t| !(0..interval).contains(&(now - t))))
        })
        .await?
    };
    if !due {
        return Ok(false);
    }

    let (bytes, _) = backup::create(&state.db, &files, &lib, now).await?;
    let size = bytes.len();
    {
        let (files, lib) = (files.clone(), lib.clone());
        blocking(move || -> Result<(), RunError> {
            let dir = library_dir(&files, &lib);
            std::fs::create_dir_all(&dir)?;
            let name = file_name(now);
            let tmp = dir.join(format!("{name}.tmp"));
            let result =
                std::fs::write(&tmp, &bytes).and_then(|_| std::fs::rename(&tmp, dir.join(&name)));
            if result.is_err() {
                let _ = std::fs::remove_file(&tmp);
            }
            Ok(result?)
        })
        .await?;
    }

    let lib2 = lib.clone();
    state
        .db
        .run(move |conn| {
            let detail = serde_json::json!({ "automatic": true }).to_string();
            conn.execute(
                "INSERT INTO audit_log (library_id, user_id, device_id, action, entity_type, entity_id, detail_json, at)
                 VALUES (?1, NULL, NULL, 'library.backup', 'library', ?1, ?2, ?3)",
                params![lib2, detail, now],
            )?;
            Ok(())
        })
        .await?;
    tracing::info!(library = %lib, size_bytes = size, "automatic backup created");

    let keep = cfg.keep as usize;
    blocking(move || -> Result<(), RunError> {
        let dir = library_dir(&files, &lib);
        // Future-dated files are neither kept nor deleted: they are not in the list.
        for old in trusted(list_auto(&files, &lib)?, now)
            .into_iter()
            .skip(keep)
        {
            // Only names produced by `file_name`, inside this library's folder.
            std::fs::remove_file(dir.join(&old.name))?;
        }
        Ok(())
    })
    .await?;
    Ok(true)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, RunError> + Send + 'static,
) -> Result<T, RunError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| RunError::Task(e.to_string()))?
}

/// Removes `auto-*.tmp` leftovers older than an hour. Best effort.
fn remove_stale_tmp(dir: &Path, now: i64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !(name.starts_with(PREFIX) && name.ends_with(".tmp")) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .map(DateTime::<Utc>::from)
            .map(|d| d.timestamp());
        if modified.is_some_and(|m| now - m > STALE_TMP_SECS) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Starts a task that calls [`run_once`] at startup and then every hour. Call once per process.
pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(TICK);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            run_once(&state, Utc::now().timestamp()).await;
        }
    })
}
