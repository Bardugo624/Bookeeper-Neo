//! Saved connections (design §6.7): one JSON file in the app data folder.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
}

/// Owns the file path; the mutex serialises read-modify-write cycles.
pub struct Store {
    path: PathBuf,
    lock: Mutex<()>,
}

impl Store {
    pub fn new(dir: &Path) -> Self {
        Store {
            path: dir.join("connections.json"),
            lock: Mutex::new(()),
        }
    }

    fn guard(&self) -> std::sync::MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn load(&self) -> Result<Connections, String> {
        let _g = self.guard();
        self.read()
    }

    pub fn upsert(&self, mut c: Connection) -> Result<Connections, String> {
        normalize(&mut c)?;
        let _g = self.guard();
        let mut all = self.read()?;
        if c.kind == ConnectionKind::Local
            && all
                .items
                .iter()
                .any(|o| o.kind == ConnectionKind::Local && o.id != c.id)
        {
            return Err("only one local connection is allowed".into());
        }
        match all.items.iter_mut().find(|o| o.id == c.id) {
            Some(slot) => *slot = c,
            None => all.items.push(c),
        }
        self.write(&all)?;
        Ok(all)
    }

    pub fn activate(&self, id: &str) -> Result<Connections, String> {
        let id = normalize_id(id)?;
        let id = id.as_str();
        let _g = self.guard();
        let mut all = self.read()?;
        if !all.items.iter().any(|c| c.id == id) {
            return Err("no such connection".into());
        }
        all.active = Some(id.to_string());
        self.write(&all)?;
        Ok(all)
    }

    pub fn remove(&self, id: &str) -> Result<Connections, String> {
        let id = normalize_id(id)?;
        let id = id.as_str();
        let _g = self.guard();
        let mut all = self.read()?;
        all.items.retain(|c| c.id != id);
        if all.active.as_deref() == Some(id) {
            all.active = None;
        }
        self.write(&all)?;
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
            Err(_) => {
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let mut aside = self
                    .path
                    .with_file_name(format!("connections.json.corrotto-{secs}"));
                // Never overwrite a file set aside earlier.
                let mut n = 0u32;
                while aside.exists() {
                    n += 1;
                    aside = self
                        .path
                        .with_file_name(format!("connections.json.corrotto-{secs}-{n}"));
                }
                // Never log the content: it may hold tokens.
                tracing::warn!(
                    "connections file is unreadable; setting it aside and starting empty"
                );
                std::fs::rename(&self.path, &aside)
                    .map_err(|e| format!("cannot set aside corrupt connections: {}", e.kind()))?;
                Ok(Connections::default())
            }
        }
    }

    fn write(&self, all: &Connections) -> Result<(), String> {
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
