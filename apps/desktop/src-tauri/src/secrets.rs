//! Secret storage behind a trait (contract "Portachiavi"): the system keychain in the app,
//! an in-memory map in tests.

use std::collections::HashMap;
use std::sync::Mutex;

pub const SERVICE: &str = "org.bookeeper.desktop";

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}

/// Where tokens live for this session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretsMode {
    Keychain,
    File,
}

impl SecretsMode {
    pub fn as_str(self) -> &'static str {
        match self {
            SecretsMode::Keychain => "keychain",
            SecretsMode::File => "file",
        }
    }
}

/// In-memory store, for tests.
#[derive(Default)]
pub struct MemoryStore {
    map: Mutex<HashMap<String, String>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.map.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl SecretStore for MemoryStore {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        let m = self.map.lock().unwrap_or_else(|e| e.into_inner());
        Ok(m.get(key).cloned())
    }
    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        let mut m = self.map.lock().unwrap_or_else(|e| e.into_inner());
        m.insert(key.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, key: &str) -> Result<(), String> {
        let mut m = self.map.lock().unwrap_or_else(|e| e.into_inner());
        m.remove(key);
        Ok(())
    }
}

/// The operating system's keychain (Windows Credential Manager, macOS Keychain,
/// Secret Service on Linux).
pub struct SystemStore;

impl SystemStore {
    fn entry(key: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, key).map_err(|e| describe(&e))
    }
}

// Error text from the crate can name the entry; keep only the variant.
fn describe(e: &keyring::Error) -> String {
    let kind = match e {
        keyring::Error::PlatformFailure(_) => "platform failure",
        keyring::Error::NoStorageAccess(_) => "no storage access",
        keyring::Error::NoEntry => "no entry",
        keyring::Error::BadEncoding(_) => "bad encoding",
        keyring::Error::TooLong(..) => "too long",
        keyring::Error::Invalid(..) => "invalid",
        keyring::Error::Ambiguous(_) => "ambiguous",
        _ => "error",
    };
    format!("keychain: {kind}")
}

impl SecretStore for SystemStore {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        match Self::entry(key)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(describe(&e)),
        }
    }
    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        Self::entry(key)?
            .set_password(value)
            .map_err(|e| describe(&e))
    }
    fn delete(&self, key: &str) -> Result<(), String> {
        match Self::entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(describe(&e)),
        }
    }
}

/// Write, read and delete a control entry. The result holds for the whole session.
pub fn probe(store: &dyn SecretStore) -> SecretsMode {
    const KEY: &str = "probe/check";
    const VALUE: &str = "bookeeper-probe";
    let ok = store.set(KEY, VALUE).is_ok()
        && matches!(store.get(KEY), Ok(Some(v)) if v == VALUE)
        && store.delete(KEY).is_ok();
    if ok {
        SecretsMode::Keychain
    } else {
        let _ = store.delete(KEY);
        tracing::warn!("system keychain unavailable; tokens stay in the 0600 file");
        SecretsMode::File
    }
}
