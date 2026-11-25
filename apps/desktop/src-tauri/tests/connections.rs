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
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json");
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(
        v["app"]["windows"][0]["decorations"],
        serde_json::Value::Bool(false)
    );
}
