//! The book file for the reader: copied once from the library into the app cache, checked
//! against the hash the library announced, and kept among the ten most recently used.
//!
//! The webview reads the copy through the `asset` protocol, whose scope is only
//! `$APPCACHE/reader/**`.

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

use crate::connections::Store;
use crate::download::{self, Source};

/// How many files stay in the cache.
pub const KEEP: usize = 10;

/// A hidden file (`.<uuid>.part`, `.bookeeper-*.tmp`) older than this is a leftover of an
/// interrupted copy and is deleted.
pub const STALE_AFTER: Duration = Duration::from_secs(3600);

/// One lock per destination file: a second request for the same book waits for the first.
fn lock_for(dest: &Path) -> Arc<tokio::sync::Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let mut map = LOCKS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    // Locks nobody holds or waits for any more (only the map owns them) are dropped.
    map.retain(|_, l| Arc::strong_count(l) > 1);
    Arc::clone(map.entry(dest.to_owned()).or_default())
}

/// What the webview asks for.
pub struct ReaderFile<'a> {
    pub connection_id: Option<&'a str>,
    pub book_id: &'a str,
    pub file_id: &'a str,
    /// The hash the library announced for the file (64 lowercase hex digits).
    pub sha256: &'a str,
    /// The file extension (`epub`, `pdf`, ...).
    pub format: &'a str,
    /// Request headers, normally the session's `Authorization`.
    pub headers: &'a BTreeMap<String, String>,
}

fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The copy of the file: `<cache_dir>/reader/<sha256>.<format>`. Returns its path, copying it
/// first when it is not there yet. A copy whose hash differs is deleted and is an error.
pub async fn fetch(
    store: &Store,
    router: axum::Router,
    cache_dir: &Path,
    req: &ReaderFile<'_>,
) -> Result<PathBuf, String> {
    let sha = req.sha256.to_ascii_lowercase();
    if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid checksum".to_owned());
    }
    if req.format.is_empty()
        || req.format.len() > 8
        || !req.format.bytes().all(|b| b.is_ascii_alphanumeric())
        || !is_id(req.book_id)
        || !is_id(req.file_id)
    {
        return Err("Invalid file".to_owned());
    }
    let dir = cache_dir.join("reader");
    let dest = dir.join(format!("{sha}.{}", req.format.to_ascii_lowercase()));
    if tokio::fs::metadata(&dest).await.is_ok_and(|m| m.is_file()) {
        touch(&dest);
        return Ok(dest);
    }
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let lock = lock_for(&dest);
    let _guard = lock.lock().await;
    // The request that held the lock may have just finished the copy.
    if tokio::fs::metadata(&dest).await.is_ok_and(|m| m.is_file()) {
        touch(&dest);
        return Ok(dest);
    }

    let path = format!(
        "/api/v1/books/{}/files/{}/content",
        req.book_id, req.file_id
    );
    let mut opened = download::open(store, router, req.connection_id, &path, req.headers).await?;
    if !(200..300).contains(&opened.status) {
        return Err(format!("The library answered {}", opened.status));
    }
    let part = dir.join(format!(".{}.part", uuid::Uuid::now_v7()));
    let result = copy_checked(&mut opened.source, &part, &sha).await;
    if let Err(e) = result {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(e);
    }
    if let Err(e) = tokio::fs::rename(&part, &dest).await {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(format!("cannot write {}: {e}", dest.display()));
    }
    let keep_dir = dir.clone();
    let keep_file = dest.clone();
    let _ = tokio::task::spawn_blocking(move || prune(&keep_dir, KEEP, &keep_file)).await;
    Ok(dest)
}

async fn copy_checked(source: &mut Source, part: &Path, sha: &str) -> Result<(), String> {
    download::write_stream(source, part).await?;
    let mut file = tokio::fs::File::open(part)
        .await
        .map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    if hex::encode(hasher.finalize()) == sha {
        Ok(())
    } else {
        Err("The file does not match its checksum".to_owned())
    }
}

/// Marks a file as just used.
fn touch(path: &Path) {
    if let Ok(f) = std::fs::OpenOptions::new().write(true).open(path) {
        let _ = f.set_modified(SystemTime::now());
    }
}

/// Deletes the least recently used files of `dir` until `keep` remain. `protect` is never
/// deleted (it is the file just served). Hidden files (copies in progress) are not counted and
/// are left alone, unless they are older than [`STALE_AFTER`]: those are leftovers of an
/// interrupted copy and are deleted.
pub fn prune(dir: &Path, keep: usize, protect: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();
    for e in std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
    {
        let name = e.file_name().to_string_lossy().into_owned();
        let leftover = name.starts_with('.') && (name.ends_with(".part") || name.ends_with(".tmp"));
        let old = e
            .metadata()
            .ok()
            .filter(|m| m.is_file())
            .and_then(|m| m.modified().ok())
            .is_some_and(|t| now.duration_since(t).is_ok_and(|age| age > STALE_AFTER));
        if leftover && old {
            let _ = std::fs::remove_file(e.path());
        }
    }
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| {
            let meta = e.metadata().ok().filter(|m| m.is_file())?;
            Some((meta.modified().ok()?, e.path()))
        })
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort_by_key(|(t, _)| *t);
    let mut excess = files.len() - keep;
    for (_, path) in files {
        if excess == 0 {
            break;
        }
        if path == protect {
            continue;
        }
        if std::fs::remove_file(&path).is_ok() {
            excess -= 1;
        }
    }
}
