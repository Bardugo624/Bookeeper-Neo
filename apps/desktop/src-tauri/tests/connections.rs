use bookeeper_desktop_lib::connections::{Connection, ConnectionKind, Store};

fn id() -> String {
    uuid::Uuid::now_v7().to_string()
}

fn remote(url: &str) -> Connection {
    Connection {
        id: id(),
        kind: ConnectionKind::Remote,
        url: Some(url.into()),
        fingerprint: None,
        library_name: None,
        user_name: None,
        device_id: None,
        access_token: None,
        refresh_token: None,
    }
}

fn local() -> Connection {
    Connection {
        kind: ConnectionKind::Local,
        url: None,
        ..remote("")
    }
}

fn store() -> (tempfile::TempDir, Store) {
    let d = tempfile::tempdir().unwrap();
    let s = Store::new(d.path());
    (d, s)
}

#[test]
fn an_empty_folder_gives_no_connections() {
    let (_d, s) = store();
    let c = s.load().unwrap();
    assert!(c.active.is_none() && c.items.is_empty());
}

#[test]
fn an_empty_file_gives_no_connections() {
    let (d, s) = store();
    std::fs::write(d.path().join("connections.json"), "").unwrap();
    assert!(s.load().unwrap().items.is_empty());
}

#[test]
fn upsert_then_load_round_trips() {
    let (d, s) = store();
    let mut c = remote("https://lib.example");
    c.access_token = Some("tok".into());
    let saved = s.upsert(c.clone()).unwrap();
    assert_eq!(saved.items, vec![c.clone()]);
    // A fresh store over the same folder sees the same data.
    assert_eq!(Store::new(d.path()).load().unwrap(), saved);
}

#[test]
fn upsert_replaces_by_id() {
    let (_d, s) = store();
    let mut c = remote("https://a.example");
    s.upsert(c.clone()).unwrap();
    c.library_name = Some("Casa".into());
    let all = s.upsert(c).unwrap();
    assert_eq!(all.items.len(), 1);
    assert_eq!(all.items[0].library_name.as_deref(), Some("Casa"));
}

#[test]
fn activate_needs_an_existing_id() {
    let (_d, s) = store();
    assert!(s.activate(&id()).is_err());
    let c = remote("https://a.example");
    s.upsert(c.clone()).unwrap();
    assert_eq!(s.activate(&c.id).unwrap().active, Some(c.id));
}

#[test]
fn removing_the_active_connection_clears_active() {
    let (_d, s) = store();
    let a = remote("https://a.example");
    let b = remote("https://b.example");
    s.upsert(a.clone()).unwrap();
    s.upsert(b.clone()).unwrap();
    s.activate(&a.id).unwrap();
    let all = s.remove(&b.id).unwrap();
    assert_eq!(all.active, Some(a.id.clone()));
    let all = s.remove(&a.id).unwrap();
    assert!(all.active.is_none() && all.items.is_empty());
}

#[test]
fn a_second_local_connection_is_refused() {
    let (_d, s) = store();
    let first = local();
    s.upsert(first.clone()).unwrap();
    assert!(s.upsert(local()).is_err());
    // Updating the same one is fine.
    s.upsert(first).unwrap();
}

#[test]
fn the_id_must_be_a_uuid() {
    let (_d, s) = store();
    let mut c = remote("https://a.example");
    c.id = "not-a-uuid".into();
    assert!(s.upsert(c).is_err());
}

#[test]
fn local_has_no_url_or_fingerprint() {
    let (_d, s) = store();
    let mut c = local();
    c.url = Some("http://x".into());
    assert!(s.upsert(c).is_err());
    let mut c = local();
    c.fingerprint = Some("a".repeat(64));
    assert!(s.upsert(c).is_err());
}

#[test]
fn remote_needs_an_http_url() {
    let (_d, s) = store();
    assert!(s.upsert(remote("ftp://x.example")).is_err());
    assert!(s.upsert(remote("x.example")).is_err());
    assert!(s.upsert(remote("http://")).is_err());
    let mut c = remote("");
    c.url = None;
    assert!(s.upsert(c).is_err());
    s.upsert(remote("http://192.168.1.5:8080")).unwrap();
}

#[test]
fn the_trailing_slash_is_dropped() {
    let (_d, s) = store();
    let all = s.upsert(remote("https://a.example//")).unwrap();
    assert_eq!(all.items[0].url.as_deref(), Some("https://a.example"));
}

#[test]
fn a_bad_fingerprint_is_refused() {
    let (_d, s) = store();
    for bad in ["abc", &"g".repeat(64), &"a".repeat(65)] {
        let mut c = remote("https://a.example");
        c.fingerprint = Some(bad.to_string());
        assert!(s.upsert(c).is_err());
    }
}

#[test]
fn the_fingerprint_is_stored_lowercase() {
    let (_d, s) = store();
    let mut c = remote("https://a.example");
    c.fingerprint = Some("AB".repeat(32));
    let all = s.upsert(c).unwrap();
    assert_eq!(
        all.items[0].fingerprint.as_deref(),
        Some("ab".repeat(32).as_str())
    );
}

#[test]
fn a_corrupt_file_is_set_aside() {
    let (d, s) = store();
    std::fs::write(d.path().join("connections.json"), "{ not json secret").unwrap();
    assert!(s.load().unwrap().items.is_empty());
    let found = std::fs::read_dir(d.path())
        .unwrap()
        .filter_map(Result::ok)
        .any(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("connections.json.corrotto-")
        });
    assert!(found);
    assert!(!d.path().join("connections.json").exists());
}

#[cfg(unix)]
#[test]
fn the_file_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let (d, s) = store();
    s.upsert(remote("https://a.example")).unwrap();
    let mode = std::fs::metadata(d.path().join("connections.json"))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
}

#[test]
fn debug_never_prints_tokens() {
    let mut c = remote("https://a.example");
    c.access_token = Some("SECRET-ACCESS".into());
    c.refresh_token = Some("SECRET-REFRESH".into());
    let text = format!("{c:?}");
    assert!(!text.contains("SECRET"));
    let all = Store::new(tempfile::tempdir().unwrap().path())
        .load()
        .unwrap();
    assert!(!format!("{all:?}").contains("SECRET"));
}

#[test]
fn tauri_conf_has_no_decorations() {
    let dir = std::env::var("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR is not set: run the test through `cargo test`");
    let path = format!("{dir}/tauri.conf.json");
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(
        v["app"]["windows"][0]["decorations"],
        serde_json::Value::Bool(false)
    );
}

#[test]
fn activate_accepts_any_spelling_of_the_id() {
    let (_d, s) = store();
    let c = remote("https://a.example");
    s.upsert(c.clone()).unwrap();
    let braced = format!("{{{}}}", c.id.to_uppercase());
    assert_eq!(s.activate(&braced).unwrap().active, Some(c.id));
}

#[test]
fn remove_accepts_any_spelling_of_the_id() {
    let (_d, s) = store();
    let c = remote("https://a.example");
    s.upsert(c.clone()).unwrap();
    s.activate(&c.id).unwrap();
    let all = s.remove(&format!("{{{}}}", c.id.to_uppercase())).unwrap();
    assert!(all.items.is_empty() && all.active.is_none());
}

#[test]
fn activate_and_remove_refuse_a_non_uuid() {
    let (_d, s) = store();
    s.upsert(remote("https://a.example")).unwrap();
    assert!(s.activate("not-a-uuid").is_err());
    assert!(s.remove("not-a-uuid").is_err());
    assert_eq!(s.load().unwrap().items.len(), 1);
}

#[test]
fn two_corrupt_files_in_one_second_are_both_kept() {
    let (d, s) = store();
    let path = d.path().join("connections.json");
    for body in ["{ first", "{ second", "{ third"] {
        std::fs::write(&path, body).unwrap();
        assert!(s.load().unwrap().items.is_empty());
    }
    let mut bodies: Vec<String> = std::fs::read_dir(d.path())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("connections.json.corrotto-")
        })
        .map(|e| std::fs::read_to_string(e.path()).unwrap())
        .collect();
    bodies.sort();
    assert_eq!(bodies, ["{ first", "{ second", "{ third"]);
}

fn aside_files(dir: &std::path::Path) -> Vec<(String, String)> {
    let mut v: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("connections.json.corrotto-")
        })
        .map(|e| {
            (
                e.file_name().to_string_lossy().into_owned(),
                std::fs::read_to_string(e.path()).unwrap(),
            )
        })
        .collect();
    v.sort();
    v
}

#[test]
fn a_taken_aside_name_stays_intact_and_the_next_name_is_used() {
    let (d, s) = store();
    let path = d.path().join("connections.json");
    // Every name this second could pick is already taken.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    for secs in now.saturating_sub(1)..=now + 2 {
        std::fs::write(
            d.path().join(format!("connections.json.corrotto-{secs}")),
            "old",
        )
        .unwrap();
    }
    std::fs::write(&path, "{ new").unwrap();
    assert!(s.load().unwrap().items.is_empty());
    let files = aside_files(d.path());
    assert_eq!(files.iter().filter(|(_, b)| b == "old").count(), 4);
    assert_eq!(files.iter().filter(|(_, b)| b == "{ new").count(), 1);
    assert!(!path.exists());
}

#[test]
fn two_stores_on_one_folder_keep_two_files() {
    let d = tempfile::tempdir().unwrap();
    let (a, b) = (Store::new(d.path()), Store::new(d.path()));
    let path = d.path().join("connections.json");
    std::fs::write(&path, "{ one").unwrap();
    assert!(a.load().unwrap().items.is_empty());
    std::fs::write(&path, "{ two").unwrap();
    assert!(b.load().unwrap().items.is_empty());
    let bodies: Vec<_> = aside_files(d.path()).into_iter().map(|(_, b)| b).collect();
    assert_eq!(bodies.len(), 2);
    assert!(bodies.contains(&"{ one".to_string()) && bodies.contains(&"{ two".to_string()));
}

#[test]
fn a_replaced_file_is_not_deleted() {
    let (d, s) = store();
    let path = d.path().join("connections.json");
    let corrupt = b"{ not json".to_vec();
    std::fs::write(&path, &corrupt).unwrap();
    // Another process sets the corrupt file aside and writes a valid one in between.
    Store::new(d.path())
        .upsert(remote("https://a.example"))
        .unwrap();
    let valid = std::fs::read(&path).unwrap();
    let loaded = s.set_aside(&corrupt).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), valid);
    assert_eq!(loaded.items.len(), 1);
    assert_eq!(s.load().unwrap().items.len(), 1);
}

#[test]
fn setting_aside_never_uses_hard_links() {
    let src = include_str!("../src/connections.rs");
    assert!(!src.contains(concat!("hard", "_link")));
}

// ---- secrets (keychain mode) ----

mod keychain {
    use super::*;
    use bookeeper_desktop_lib::secrets::{probe, MemoryStore, SecretStore, SecretsMode};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    /// A store that fails on command.
    #[derive(Default)]
    struct Flaky {
        inner: MemoryStore,
        fail_get: AtomicBool,
        fail_set: AtomicBool,
        fail_all: AtomicBool,
        fail_get_key: std::sync::Mutex<Option<String>>,
        fail_set_key: std::sync::Mutex<Option<String>>,
    }
    impl SecretStore for Flaky {
        fn get(&self, key: &str) -> Result<Option<String>, String> {
            let k = self.fail_get_key.lock().unwrap().clone();
            if self.fail_all.load(Ordering::SeqCst)
                || self.fail_get.load(Ordering::SeqCst)
                || k.as_deref().is_some_and(|k| key.starts_with(k))
            {
                return Err("boom".into());
            }
            self.inner.get(key)
        }
        fn set(&self, key: &str, value: &str) -> Result<(), String> {
            let k = self.fail_set_key.lock().unwrap().clone();
            if self.fail_all.load(Ordering::SeqCst)
                || self.fail_set.load(Ordering::SeqCst)
                || k.as_deref().is_some_and(|k| key.starts_with(k))
            {
                return Err("boom".into());
            }
            self.inner.set(key, value)
        }
        fn delete(&self, key: &str) -> Result<(), String> {
            if self.fail_all.load(Ordering::SeqCst) {
                return Err("boom".into());
            }
            self.inner.delete(key)
        }
    }

    fn with(secrets: Arc<dyn SecretStore>) -> (tempfile::TempDir, Store) {
        let d = tempfile::tempdir().unwrap();
        let s = Store::with_secrets(d.path(), secrets, SecretsMode::Keychain);
        (d, s)
    }

    fn with_tokens(url: &str, a: &str, r: &str) -> Connection {
        let mut c = remote(url);
        c.access_token = Some(a.into());
        c.refresh_token = Some(r.into());
        c
    }

    fn file(d: &tempfile::TempDir) -> String {
        std::fs::read_to_string(d.path().join("connections.json")).unwrap()
    }

    #[test]
    fn tokens_never_reach_the_file_in_keychain_mode() {
        let m = Arc::new(MemoryStore::new());
        let (d, s) = with(m.clone());
        let c = with_tokens("https://a.example", "ACCESS-1", "REFRESH-1");
        let saved = s.upsert(c.clone()).unwrap();
        assert_eq!(saved.items, vec![c.clone()]);
        let text = file(&d);
        assert!(!text.contains("ACCESS-1") && !text.contains("REFRESH-1"));
        s.activate(&c.id).unwrap();
        let text = file(&d);
        assert!(!text.contains("ACCESS-1") && !text.contains("REFRESH-1"));
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn load_fills_tokens_from_the_store() {
        let m = Arc::new(MemoryStore::new());
        let (d, s) = with(m.clone());
        let c = with_tokens("https://a.example", "A", "R");
        s.upsert(c.clone()).unwrap();
        let again = Store::with_secrets(d.path(), m, SecretsMode::Keychain);
        assert_eq!(again.load().unwrap().items, vec![c]);
    }

    #[test]
    fn migration_moves_tokens_and_rewrites_the_file() {
        let d = tempfile::tempdir().unwrap();
        let c = with_tokens("https://a.example", "OLD-A", "OLD-R");
        Store::new(d.path()).upsert(c.clone()).unwrap();
        assert!(file(&d).contains("OLD-A"));
        let m = Arc::new(MemoryStore::new());
        let s = Store::with_secrets(d.path(), m.clone(), SecretsMode::Keychain);
        assert_eq!(s.load().unwrap().items, vec![c.clone()]);
        let text = file(&d);
        assert!(!text.contains("OLD-A") && !text.contains("OLD-R"));
        assert_eq!(
            m.get(&format!("{}/access", c.id)).unwrap().as_deref(),
            Some("OLD-A")
        );
        assert_eq!(
            m.get(&format!("{}/refresh", c.id)).unwrap().as_deref(),
            Some("OLD-R")
        );
    }

    #[test]
    fn migration_keeps_the_file_when_the_store_refuses() {
        let d = tempfile::tempdir().unwrap();
        let c = with_tokens("https://a.example", "OLD-A", "OLD-R");
        Store::new(d.path()).upsert(c.clone()).unwrap();
        let before = file(&d);
        let f = Arc::new(Flaky::default());
        f.fail_set.store(true, Ordering::SeqCst);
        let s = Store::with_secrets(d.path(), f, SecretsMode::Keychain);
        assert_eq!(s.load().unwrap().items, vec![c.clone()]);
        assert_eq!(file(&d), before);
        // Other operations do not strip the tokens still in the file either.
        s.activate(&c.id).unwrap();
        assert!(file(&d).contains("OLD-A"));
    }

    #[test]
    fn keychain_only_tokens_survive_a_failed_migration() {
        let d = tempfile::tempdir().unwrap();
        let a = with_tokens("https://a.example", "OLD-A", "OLD-R");
        Store::new(d.path()).upsert(a.clone()).unwrap();
        let f = Arc::new(Flaky::default());
        *f.fail_set_key.lock().unwrap() = Some(a.id.clone());
        let s = Store::with_secrets(d.path(), f, SecretsMode::Keychain);
        let b = with_tokens("https://b.example", "B1", "B2");
        s.upsert(b.clone()).unwrap();
        let all = s.load().unwrap();
        let got = all.items.iter().find(|c| c.id == b.id).unwrap();
        assert_eq!(got, &b);
        assert!(file(&d).contains("OLD-A"));
    }

    #[test]
    fn file_mode_remove_clears_leftover_keychain_entries() {
        let d = tempfile::tempdir().unwrap();
        let m = Arc::new(MemoryStore::new());
        let c = with_tokens("https://a.example", "A", "R");
        Store::with_secrets(d.path(), m.clone(), SecretsMode::Keychain)
            .upsert(c.clone())
            .unwrap();
        assert_eq!(m.len(), 2);
        Store::with_secrets(d.path(), m.clone(), SecretsMode::File)
            .remove(&c.id)
            .unwrap();
        assert!(m.is_empty());
    }

    #[test]
    fn a_none_token_deletes_the_entry() {
        let m = Arc::new(MemoryStore::new());
        let (_d, s) = with(m.clone());
        let mut c = with_tokens("https://a.example", "A", "R");
        s.upsert(c.clone()).unwrap();
        c.access_token = None;
        c.refresh_token = None;
        let saved = s.upsert(c).unwrap();
        assert!(saved.items[0].access_token.is_none());
        assert!(m.is_empty());
    }

    #[test]
    fn remove_deletes_both_entries() {
        let m = Arc::new(MemoryStore::new());
        let (_d, s) = with(m.clone());
        let c = with_tokens("https://a.example", "A", "R");
        s.upsert(c.clone()).unwrap();
        assert_eq!(m.len(), 2);
        s.remove(&c.id).unwrap();
        assert!(m.is_empty());
    }

    #[test]
    fn a_read_failure_leaves_that_connection_without_tokens() {
        let f = Arc::new(Flaky::default());
        let (_d, s) = with(f.clone());
        let a = with_tokens("https://a.example", "A1", "R1");
        let b = with_tokens("https://b.example", "A2", "R2");
        s.upsert(a.clone()).unwrap();
        s.upsert(b.clone()).unwrap();
        *f.fail_get_key.lock().unwrap() = Some(a.id.clone());
        let all = s.load().unwrap();
        let (ra, rb) = (&all.items[0], &all.items[1]);
        assert!(ra.access_token.is_none() && ra.refresh_token.is_none());
        assert_eq!(rb, &b);
    }

    #[test]
    fn file_mode_behaves_as_before() {
        let d = tempfile::tempdir().unwrap();
        let m = Arc::new(MemoryStore::new());
        let s = Store::with_secrets(d.path(), m.clone(), SecretsMode::File);
        let c = with_tokens("https://a.example", "A", "R");
        assert_eq!(s.upsert(c.clone()).unwrap().items, vec![c]);
        assert!(file(&d).contains("\"A\""));
        assert!(m.is_empty());
        assert_eq!(s.mode(), SecretsMode::File);
    }

    #[test]
    fn the_probe_picks_file_when_the_store_is_unavailable() {
        assert_eq!(probe(&MemoryStore::new()), SecretsMode::Keychain);
        let f = Flaky::default();
        f.fail_all.store(true, Ordering::SeqCst);
        assert_eq!(probe(&f), SecretsMode::File);
        let f = Flaky::default();
        f.fail_set.store(true, Ordering::SeqCst);
        assert_eq!(probe(&f), SecretsMode::File);
    }

    #[test]
    fn secrets_is_reported() {
        let (_d, s) = with(Arc::new(MemoryStore::new()));
        let v = serde_json::to_value(bookeeper_desktop_lib::connections_view(&s).unwrap()).unwrap();
        assert_eq!(v["secrets"], "keychain");
        assert!(v["items"].is_array());
        let (_d, s) = store();
        let v = serde_json::to_value(bookeeper_desktop_lib::connections_view(&s).unwrap()).unwrap();
        assert_eq!(v["secrets"], "file");
    }

    #[test]
    #[ignore = "uses the real system keychain"]
    fn the_real_keychain_round_trips() {
        let s = bookeeper_desktop_lib::secrets::SystemStore;
        let key = format!("test/{}", id());
        s.set(&key, "v").unwrap();
        assert_eq!(s.get(&key).unwrap().as_deref(), Some("v"));
        s.delete(&key).unwrap();
        assert_eq!(s.get(&key).unwrap(), None);
    }
}

// ---- stale_secrets ----

mod stale {
    use super::*;
    use bookeeper_desktop_lib::secrets::{MemoryStore, SecretStore, SecretsMode};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    /// A memory keychain whose deletions can be made to fail, and whose reads are counted.
    #[derive(Default)]
    struct Flaky {
        inner: MemoryStore,
        fail_delete: AtomicBool,
        reads: std::sync::Mutex<Vec<String>>,
    }

    impl SecretStore for Flaky {
        fn get(&self, key: &str) -> Result<Option<String>, String> {
            self.reads.lock().unwrap().push(key.to_string());
            self.inner.get(key)
        }
        fn set(&self, key: &str, value: &str) -> Result<(), String> {
            self.inner.set(key, value)
        }
        fn delete(&self, key: &str) -> Result<(), String> {
            if self.fail_delete.load(Ordering::SeqCst) {
                return Err("down".into());
            }
            self.inner.delete(key)
        }
    }

    fn file_json(d: &std::path::Path) -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(d.join("connections.json")).unwrap()).unwrap()
    }

    #[test]
    fn failed_deletions_are_listed_retried_cleared_and_never_read() {
        let d = tempfile::tempdir().unwrap();
        let kc = Arc::new(Flaky::default());
        // An earlier keychain session saved tokens.
        let keychain = Store::with_secrets(d.path(), kc.clone(), SecretsMode::Keychain);
        let mut c = remote("https://a.example");
        c.access_token = Some("old-access".into());
        c.refresh_token = Some("old-refresh".into());
        keychain.upsert(c.clone()).unwrap();

        // Fallen back to file mode while the keychain is down.
        kc.fail_delete.store(true, Ordering::SeqCst);
        let file = Store::with_secrets(d.path(), kc.clone(), SecretsMode::File);
        let mut cleared = c.clone();
        cleared.access_token = None;
        cleared.refresh_token = None;
        file.upsert(cleared).unwrap();
        let other = remote("https://b.example");
        file.upsert(other.clone()).unwrap();
        file.remove(&other.id).unwrap();

        let json = file_json(d.path());
        let stale: Vec<String> = serde_json::from_value(json["stale_secrets"].clone()).unwrap();
        for k in [
            format!("{}/access", c.id),
            format!("{}/refresh", c.id),
            format!("{}/access", other.id),
            format!("{}/refresh", other.id),
        ] {
            assert!(stale.contains(&k), "{k} missing from {stale:?}");
        }
        // Keys only, never values.
        assert!(!json.to_string().contains("old-access"));

        // Next start in keychain mode, deletion still failing: nothing is read, tokens stay empty.
        kc.reads.lock().unwrap().clear();
        let still = Store::with_secrets(d.path(), kc.clone(), SecretsMode::Keychain);
        let loaded = still.load().unwrap();
        assert!(loaded.items[0].access_token.is_none());
        assert!(loaded.items[0].refresh_token.is_none());
        assert!(kc.reads.lock().unwrap().is_empty(), "stale key was read");
        assert!(!file_json(d.path())["stale_secrets"]
            .as_array()
            .unwrap()
            .is_empty());

        // Keychain back: the start retries, empties the list, and the old token is gone.
        kc.fail_delete.store(false, Ordering::SeqCst);
        let fresh = Store::with_secrets(d.path(), kc.clone(), SecretsMode::Keychain);
        assert!(file_json(d.path()).get("stale_secrets").is_none());
        assert_eq!(kc.inner.get(&format!("{}/access", c.id)).unwrap(), None);
        assert!(fresh.load().unwrap().items[0].access_token.is_none());
    }

    #[test]
    fn migration_keeps_unwritten_keys_stale_and_unread() {
        let d = tempfile::tempdir().unwrap();
        let kc = Arc::new(Flaky::default());
        let keychain = Store::with_secrets(d.path(), kc.clone(), SecretsMode::Keychain);
        let mut a = remote("https://a.example");
        a.access_token = Some("A-old".into());
        a.refresh_token = Some("A-old-r".into());
        keychain.upsert(a.clone()).unwrap();
        let b = remote("https://b.example");
        keychain.upsert(b.clone()).unwrap();

        // File mode, deletions failing: log out of A, refresh B.
        kc.fail_delete.store(true, Ordering::SeqCst);
        let file = Store::with_secrets(d.path(), kc.clone(), SecretsMode::File);
        let mut out = a.clone();
        out.access_token = None;
        out.refresh_token = None;
        file.upsert(out).unwrap();
        let mut b2 = b.clone();
        b2.access_token = Some("B-new".into());
        file.upsert(b2).unwrap();

        // Keychain mode, deletions still failing: migration runs because B has tokens.
        kc.reads.lock().unwrap().clear();
        let s = Store::with_secrets(d.path(), kc.clone(), SecretsMode::Keychain);
        let loaded = s.load().unwrap();
        let la = loaded.items.iter().find(|c| c.id == a.id).unwrap();
        assert!(la.access_token.is_none() && la.refresh_token.is_none());
        let stale = file_json(d.path())["stale_secrets"].to_string();
        assert!(stale.contains(&format!("{}/access", a.id)));
        assert!(stale.contains(&format!("{}/refresh", a.id)));
        assert!(!kc
            .reads
            .lock()
            .unwrap()
            .iter()
            .any(|k| k.starts_with(&a.id)));
    }
}
