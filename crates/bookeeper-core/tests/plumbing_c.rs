use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;

use bookeeper_core::lookup::{LookupService, Metadata, Provider};
use bookeeper_core::{AppState, Db, DbError, SetupPolicy};

fn db() -> Db {
    Db::open_in_memory().unwrap()
}

#[test]
fn open_with_data_creates_the_folders() {
    let dir = tempfile::tempdir().unwrap();
    let data = dir.path().join("data");
    let state = AppState::open_with_data(db(), SetupPolicy::Open, &data).unwrap();
    assert!(data.join("covers").is_dir());
    assert!(data.join("backups").is_dir());
    assert_eq!(state.files.covers_dir, data.join("covers"));
    assert_eq!(state.files.backups_dir, data.join("backups"));
}

#[test]
fn open_with_data_reports_the_path_on_failure() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("a-file");
    std::fs::write(&file, b"x").unwrap();
    let bad = file.join("sub");
    let err = AppState::open_with_data(db(), SetupPolicy::Open, &bad).unwrap_err();
    assert!(matches!(err, DbError::Io { .. }));
    assert!(err.to_string().contains(&file.display().to_string()));
}

#[test]
fn open_uses_a_unique_temp_folder_each_time() {
    let a = AppState::open(db(), SetupPolicy::Open).unwrap();
    let b = AppState::open(db(), SetupPolicy::Open).unwrap();
    assert_ne!(a.files.covers_dir, b.files.covers_dir);
    assert!(a.files.covers_dir.is_dir() && b.files.covers_dir.is_dir());
    assert!(a.files.backups_dir.is_dir() && b.files.backups_dir.is_dir());
}

#[test]
fn for_tests_allows_private_fetch_and_open_with_data_does_not() {
    assert!(AppState::for_tests().allow_private_fetch);
    let dir = tempfile::tempdir().unwrap();
    let s = AppState::open_with_data(db(), SetupPolicy::Open, dir.path()).unwrap();
    assert!(!s.allow_private_fetch);
}

#[tokio::test]
async fn http_client_sends_the_user_agent() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut sock, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let n = sock.read(&mut buf).unwrap();
        sock.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .unwrap();
        String::from_utf8_lossy(&buf[..n]).to_string()
    });
    let state = AppState::for_tests();
    state
        .http
        .get(format!("http://{addr}/"))
        .send()
        .await
        .unwrap();
    let req = server.join().unwrap().to_ascii_lowercase();
    assert!(req.contains("user-agent: bookeeper/"), "{req}");
}

#[test]
fn lookup_service_lists_providers_in_order() {
    let svc = LookupService::new(reqwest::Client::new());
    assert_eq!(
        svc.provider_names(),
        vec!["google-books", "annas-archive", "open-library"]
    );
}

#[tokio::test]
async fn stub_lookup_returns_none() {
    let svc = LookupService::new(reqwest::Client::new());
    assert_eq!(svc.lookup("9780306406157", false, 0).await, None);
    for p in [
        Arc::new(bookeeper_core::lookup::GoogleBooks::new(
            reqwest::Client::new(),
        )) as Arc<dyn Provider>,
        Arc::new(bookeeper_core::lookup::AnnasArchive::new(
            reqwest::Client::new(),
        )),
        Arc::new(bookeeper_core::lookup::OpenLibrary::new(
            reqwest::Client::new(),
        )),
    ] {
        assert_eq!(p.lookup("9780306406157").await, Ok(None));
    }
}

#[test]
fn metadata_serializes_with_snake_case_and_nulls() {
    let v = serde_json::to_value(Metadata::default()).unwrap();
    assert!(v["title"].is_null());
    assert_eq!(v["authors"], serde_json::json!([]));
    assert_eq!(v["cover_candidates"], serde_json::json!([]));
    assert!(v["published_year"].is_null());
    assert!(v.get("isbn_13").is_some());
}
