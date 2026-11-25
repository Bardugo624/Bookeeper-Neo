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
