//! Saved connections (design §6.7): one JSON file in the app data folder.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::secrets::{SecretStore, SecretsMode};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionKind {
    Local,
    Remote,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub kind: ConnectionKind,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub fingerprint: Option<String>,
    #[serde(default)]
    pub library_name: Option<String>,
    #[serde(default)]
    pub user_name: Option<String>,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

// Written by hand so the tokens can never reach a log line.
impl fmt::Debug for Connection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let redact = |t: &Option<String>| t.as_ref().map(|_| "<redacted>");
        f.debug_struct("Connection")
            .field("id", &self.id)
            .field("kind", &self.kind)
            .field("url", &self.url)
            .field("fingerprint", &self.fingerprint)
            .field("library_name", &self.library_name)
            .field("user_name", &self.user_name)
            .field("device_id", &self.device_id)
            .field("access_token", &redact(&self.access_token))
            .field("refresh_token", &redact(&self.refresh_token))
            .finish()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Connections {
    #[serde(default)]
    pub active: Option<String>,
    #[serde(default)]
    pub items: Vec<Connection>,
    /// Keychain keys (never values) whose deletion failed. Retried at every start in
    /// keychain mode, before any token is read; a key listed here is never read.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stale_secrets: Vec<String>,
}

/// Owns the file path; the mutex serialises read-modify-write cycles.
pub struct Store {
    path: PathBuf,
    lock: Mutex<()>,
    secrets: Arc<dyn SecretStore>,
    mode: SecretsMode,
}

impl Store {
    /// File mode: tokens stay in `connections.json`, as before.
    pub fn new(dir: &Path) -> Self {
        Self::with_secrets(
            dir,
            Arc::new(crate::secrets::MemoryStore::new()),
            SecretsMode::File,
        )
    }

    pub fn with_secrets(dir: &Path, secrets: Arc<dyn SecretStore>, mode: SecretsMode) -> Self {
        let store = Store {
            path: dir.join("connections.json"),
            lock: Mutex::new(()),
            secrets,
            mode,
        };
        if store.keychain() {
            store.purge_stale();
        }
        store
    }

    /// Retries the deletions that failed in an earlier session. Runs before any read of
    /// the tokens; keys that still cannot be deleted stay listed (and stay unread).
    fn purge_stale(&self) {
        let _g = self.guard();
        let Ok(mut all) = self.read() else { return };
        if all.stale_secrets.is_empty() {
            return;
        }
        let before = all.stale_secrets.len();
        all.stale_secrets
            .retain(|k| self.secrets.delete(k).is_err());
        if all.stale_secrets.len() != before {
            if let Err(e) = self.write_raw(&all) {
                tracing::warn!("cannot update the stale keychain entries: {e}");
            }
        }
    }

    /// Deletes a keychain entry; if that fails the key is remembered in `all`.
    fn delete_or_mark(&self, all: &mut Connections, key: String) {
        if self.secrets.delete(&key).is_err() {
            tracing::warn!("cannot delete a keychain entry; it will be retried at start");
            if !all.stale_secrets.contains(&key) {
                all.stale_secrets.push(key);
            }
        }
    }

    pub fn mode(&self) -> SecretsMode {
        self.mode
    }

    fn keychain(&self) -> bool {
        self.mode == SecretsMode::Keychain
    }

    fn guard(&self) -> std::sync::MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn load(&self) -> Result<Connections, String> {
        let _g = self.guard();
        let (mut all, _clean) = self.read_migrated()?;
        if self.keychain() {
            self.fill(&mut all);
        }
        Ok(all)
    }

    /// Reads the file; in keychain mode also migrates any tokens found in it. The flag is
    /// false when tokens are still in the file (keychain refused them), so a later write
    /// must not strip them.
    fn read_migrated(&self) -> Result<(Connections, bool), String> {
        let mut all = self.read()?;
        let clean = !self.keychain() || self.migrate(&mut all);
        Ok((all, clean))
    }

    /// Moves tokens found in the file to the keychain and rewrites the file without them.
    /// If the keychain refuses any write, the file is left as it is.
    fn migrate(&self, all: &mut Connections) -> bool {
        if !all
            .items
            .iter()
            .any(|c| c.access_token.is_some() || c.refresh_token.is_some())
        {
            return true;
        }
        let mut written: Vec<String> = Vec::new();
        for c in &all.items {
            for (suffix, tok) in [("access", &c.access_token), ("refresh", &c.refresh_token)] {
                if let Some(t) = tok {
                    let key = format!("{}/{suffix}", c.id);
                    if self.secrets.set(&key, t).is_err() {
                        tracing::warn!("keychain refused a token; keeping them in the file");
                        return false;
                    }
                    written.push(key);
                }
            }
        }
        // Only keys actually overwritten stop being pending deletion.
        all.stale_secrets.retain(|k| !written.contains(k));
        let mut clean = all.clone();
        for c in &mut clean.items {
            c.access_token = None;
            c.refresh_token = None;
        }
        if let Err(e) = self.write_raw(&clean) {
            tracing::warn!("cannot rewrite connections after migration: {e}");
            return false;
        }
        for c in &mut all.items {
            c.access_token = None;
            c.refresh_token = None;
        }
        true
    }

    /// Fills the tokens from the keychain; a failure leaves that connection without tokens.
    /// A connection whose tokens are still in the file (failed migration) keeps them.
    fn fill(&self, all: &mut Connections) {
        let stale = all.stale_secrets.clone();
        for c in &mut all.items {
            if c.access_token.is_some() || c.refresh_token.is_some() {
                continue;
            }
            // A key whose deletion is pending is never read: its value is revoked.
            let (ka, kr) = (format!("{}/access", c.id), format!("{}/refresh", c.id));
            if stale.contains(&ka) || stale.contains(&kr) {
                c.access_token = None;
                c.refresh_token = None;
                continue;
            }
            let access = self.secrets.get(&format!("{}/access", c.id));
            let refresh = self.secrets.get(&format!("{}/refresh", c.id));
            match (access, refresh) {
                (Ok(a), Ok(r)) => {
                    c.access_token = a;
                    c.refresh_token = r;
                }
                _ => {
                    tracing::warn!(connection = %c.id, "cannot read tokens from the keychain");
                    c.access_token = None;
                    c.refresh_token = None;
                }
            }
        }
    }

    pub fn upsert(&self, mut c: Connection) -> Result<Connections, String> {
        normalize(&mut c)?;
        let _g = self.guard();
        let (mut all, clean) = self.read_migrated()?;
        if c.kind == ConnectionKind::Local
            && all
                .items
                .iter()
                .any(|o| o.kind == ConnectionKind::Local && o.id != c.id)
        {
            return Err("only one local connection is allowed".into());
        }
        let tokens = (c.access_token.clone(), c.refresh_token.clone());
        match all.items.iter_mut().find(|o| o.id == c.id) {
            Some(slot) => *slot = c.clone(),
            None => all.items.push(c.clone()),
        }
        if self.keychain() {
            for (suffix, tok) in [("access", &tokens.0), ("refresh", &tokens.1)] {
                let key = format!("{}/{suffix}", c.id);
                match tok {
                    Some(t) => self.secrets.set(&key, t),
                    None => self.secrets.delete(&key),
                }
                .map_err(|_| "cannot save tokens in the keychain".to_string())?;
                // Written or deleted just now: nothing is pending for this key.
                all.stale_secrets.retain(|k| *k != key);
            }
        } else {
            for (suffix, tok) in [("access", &tokens.0), ("refresh", &tokens.1)] {
                if tok.is_none() {
                    self.delete_or_mark(&mut all, format!("{}/{suffix}", c.id));
                }
            }
        }
        if self.keychain() {
            if let Some(slot) = all.items.iter_mut().find(|o| o.id == c.id) {
                slot.access_token = None;
                slot.refresh_token = None;
            }
        }
        self.save(&all, clean)?;
        if self.keychain() {
            self.fill(&mut all);
        }
        Ok(all)
    }

    pub fn activate(&self, id: &str) -> Result<Connections, String> {
        let id = normalize_id(id)?;
        let id = id.as_str();
        let _g = self.guard();
        let (mut all, clean) = self.read_migrated()?;
        if !all.items.iter().any(|c| c.id == id) {
            return Err("no such connection".into());
        }
        all.active = Some(id.to_string());
        self.save(&all, clean)?;
        if self.keychain() {
            self.fill(&mut all);
        }
        Ok(all)
    }

    pub fn remove(&self, id: &str) -> Result<Connections, String> {
        let id = normalize_id(id)?;
        let id = id.as_str();
        let _g = self.guard();
        let (mut all, clean) = self.read_migrated()?;
        all.items.retain(|c| c.id != id);
        if all.active.as_deref() == Some(id) {
            all.active = None;
        }
        // Every mode: entries left by an earlier keychain session. Failures are remembered.
        for suffix in ["access", "refresh"] {
            self.delete_or_mark(&mut all, format!("{id}/{suffix}"));
        }
        self.save(&all, clean)?;
        if self.keychain() {
            self.fill(&mut all);
        }
        Ok(all)
    }

    fn read(&self) -> Result<Connections, String> {
        let bytes = match std::fs::read(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Connections::default()),
            Err(e) => return Err(format!("cannot read connections: {}", e.kind())),
        };
        if bytes.iter().all(u8::is_ascii_whitespace) {
            return Ok(Connections::default());
        }
        match serde_json::from_slice::<Connections>(&bytes) {
            Ok(c) => Ok(c),
            Err(_) => self.set_aside(&bytes),
        }
    }

    /// Sets the corrupt `bytes` aside and starts empty. The copy is created exclusively
    /// (`create_new`), so a copy made earlier, even by another process, is never overwritten.
    /// The original is removed only if it still holds exactly `bytes`; if another process has
    /// replaced it meanwhile it is left alone and reloaded. Public so tests can drive the
    /// step between reading and removing.
    #[doc(hidden)]
    pub fn set_aside(&self, bytes: &[u8]) -> Result<Connections, String> {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // Never log the content: it may hold tokens.
        tracing::warn!("connections file is unreadable; setting it aside and starting empty");
        let fail =
            |e: std::io::Error| format!("cannot set aside corrupt connections: {}", e.kind());
        let mut n = 0u32;
        loop {
            let name = if n == 0 {
                format!("connections.json.corrotto-{secs}")
            } else {
                format!("connections.json.corrotto-{secs}-{n}")
            };
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create_new(true);
            #[cfg(unix)]
            std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
            match opts.open(self.path.with_file_name(&name)) {
                Ok(mut f) => {
                    if let Err(e) = f.write_all(bytes).and_then(|()| f.sync_all()) {
                        drop(f);
                        let _ = std::fs::remove_file(self.path.with_file_name(&name));
                        return Err(fail(e));
                    }
                    break;
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => n += 1,
                Err(e) => return Err(fail(e)),
            }
        }
        match std::fs::read(&self.path) {
            Ok(now) if now == bytes => std::fs::remove_file(&self.path)
                .or_else(|e| {
                    if e.kind() == std::io::ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(e)
                    }
                })
                .map_err(fail)?,
            // Replaced or gone: not ours to delete; load what is there now.
            Ok(_) => return self.read(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(fail(e)),
        }
        Ok(Connections::default())
    }

    /// Writes the file; `strip` (keychain mode, tokens already migrated) removes the tokens.
    fn save(&self, all: &Connections, clean: bool) -> Result<(), String> {
        if self.keychain() && clean {
            let mut clean = all.clone();
            for c in &mut clean.items {
                c.access_token = None;
                c.refresh_token = None;
            }
            return self.write_raw(&clean);
        }
        self.write_raw(all)
    }

    fn write_raw(&self, all: &Connections) -> Result<(), String> {
        let json =
            serde_json::to_vec_pretty(all).map_err(|_| "cannot encode connections".to_string())?;
        let tmp = self
            .path
            .with_file_name(format!("connections.json.tmp-{}", std::process::id()));
        let io = |e: std::io::Error| format!("cannot write connections: {}", e.kind());
        let result = (|| {
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create(true).truncate(true);
            #[cfg(unix)]
            std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
            let mut f = opts.open(&tmp)?;
            f.write_all(&json)?;
            f.sync_all()?;
            drop(f);
            std::fs::rename(&tmp, &self.path)
        })();
        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp);
            return Err(io(e));
        }
        Ok(())
    }
}

fn normalize_id(id: &str) -> Result<String, String> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "id must be a UUID".to_string())?;
    Ok(id.hyphenated().to_string())
}

fn normalize(c: &mut Connection) -> Result<(), String> {
    c.id = normalize_id(&c.id)?;
    if let Some(fp) = &c.fingerprint {
        if fp.len() != 64 || !fp.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Err("fingerprint must be 64 hexadecimal digits".into());
        }
        c.fingerprint = Some(fp.to_ascii_lowercase());
    }
    match c.kind {
        ConnectionKind::Local => {
            if c.url.is_some() || c.fingerprint.is_some() {
                return Err("a local connection has no url or fingerprint".into());
            }
        }
        ConnectionKind::Remote => {
            let url = c.url.as_deref().ok_or("a remote connection needs a url")?;
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                return Err("url must start with http:// or https://".into());
            }
            let url = url.trim_end_matches('/');
            if url.ends_with("://") || url == "http:" || url == "https:" {
                return Err("url has no host".into());
            }
            c.url = Some(url.to_string());
        }
    }
    Ok(())
}
