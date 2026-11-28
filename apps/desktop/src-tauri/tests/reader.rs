//! The book file for the reader: copied once into the app cache, checked, reused.

use std::collections::BTreeMap;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use bookeeper_core::{router, AppState};
use bookeeper_desktop_lib::connections::{Connection, ConnectionKind, Store};
use bookeeper_desktop_lib::reader::{fetch, prune, ReaderFile, KEEP};
use bookeeper_desktop_lib::{dispatch, dispatch_raw};
use serde_json::{json, Value};

fn bearer(token: &str) -> BTreeMap<String, String> {
    BTreeMap::from([("Authorization".to_owned(), format!("Bearer {token}"))])
}

async fn setup(app: &axum::Router) -> String {
    let body = json!({
        "library_name": "Casa",
        "display_name": "Ada",
        "device_name": "Laptop",
        "device_kind": "desktop",
    });
    let r = dispatch(
        app.clone(),
        "POST",
        "/api/v1/setup",
        Some(body.to_string()),
        BTreeMap::new(),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let v: Value = serde_json::from_str(&r.body).unwrap();
    v["session"]["access_token"].as_str().unwrap().to_owned()
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = !0u32;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xEDB8_8320 & 0u32.wrapping_sub(crc & 1));
        }
    }
    !crc
}

/// The smallest archive the core accepts as an EPUB: one stored `mimetype` entry.
fn tiny_epub() -> Vec<u8> {
    let name = b"mimetype";
    let data = b"application/epub+zip";
    let crc = crc32(data);
    let mut out = Vec::new();
    let common = |out: &mut Vec<u8>| {
        out.extend(20u16.to_le_bytes()); // version needed
        out.extend(0u16.to_le_bytes()); // flags
        out.extend(0u16.to_le_bytes()); // stored
        out.extend(0u16.to_le_bytes()); // time
        out.extend(0x21u16.to_le_bytes()); // date
        out.extend(crc.to_le_bytes());
        out.extend((data.len() as u32).to_le_bytes());
        out.extend((data.len() as u32).to_le_bytes());
        out.extend((name.len() as u16).to_le_bytes());
    };
    out.extend(b"PK\x03\x04");
    common(&mut out);
    out.extend(0u16.to_le_bytes()); // extra length
    out.extend(name);
    out.extend(data);
    let central = out.len() as u32;
    out.extend(b"PK\x01\x02");
    out.extend(20u16.to_le_bytes()); // version made by
    common(&mut out);
    out.extend([0u8; 12]); // extra, comment, disk, internal attrs
    out.extend(0u32.to_le_bytes()); // external attrs
    out.extend(0u32.to_le_bytes()); // local header offset
    out.extend(name);
    let size = out.len() as u32 - central;
    out.extend(b"PK\x05\x06");
    out.extend([0u8; 4]); // disk numbers
    out.extend(1u16.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(size.to_le_bytes());
    out.extend(central.to_le_bytes());
    out.extend(0u16.to_le_bytes()); // comment length
    out
}

struct Uploaded {
    token: String,
    book: String,
    file: String,
    sha: String,
    bytes: Vec<u8>,
}

async fn upload(app: &axum::Router, token: &str) -> Uploaded {
    let bytes = tiny_epub();
    let up = dispatch_raw(
        app.clone(),
        "PUT",
        "/api/v1/ebook-files?name=libro.epub",
        Some(STANDARD.encode(&bytes)),
        Some("application/octet-stream".to_owned()),
        bearer(token),
    )
    .await;
    assert_eq!(up.status, 200);
    let info: Value = serde_json::from_slice(&STANDARD.decode(&up.body_base64).unwrap()).unwrap();
    let sha = info["sha256"].as_str().unwrap().to_owned();
    let r = dispatch(
        app.clone(),
        "POST",
        "/api/v1/books",
        Some(json!({"title": "Libro"}).to_string()),
        bearer(token),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let book: Value = serde_json::from_str(&r.body).unwrap();
    let book = book["id"].as_str().unwrap().to_owned();
    let r = dispatch(
        app.clone(),
        "POST",
        &format!("/api/v1/books/{book}/files"),
        Some(json!({"sha256": sha, "name": "libro.epub"}).to_string()),
        bearer(token),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let file: Value = serde_json::from_str(&r.body).unwrap();
    Uploaded {
        token: token.to_owned(),
        book,
        file: file["id"].as_str().unwrap().to_owned(),
        sha,
        bytes,
    }
}

fn store() -> (tempfile::TempDir, Store) {
    let d = tempfile::tempdir().unwrap();
    let s = Store::new(d.path());
    (d, s)
}

fn request<'a>(
    u: &'a Uploaded,
    sha: &'a str,
    headers: &'a BTreeMap<String, String>,
) -> ReaderFile<'a> {
    ReaderFile {
        connection_id: None,
        book_id: &u.book,
        file_id: &u.file,
        sha256: sha,
        format: "epub",
        headers,
    }
}

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .map(|d| {
            d.map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

#[tokio::test]
async fn reader_file_copies_once_and_reuses() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let u = upload(&app, &token).await;
    let (_d, store) = store();
    let cache = tempfile::tempdir().unwrap();
    let headers = bearer(&u.token);

    let path = fetch(
        &store,
        app.clone(),
        cache.path(),
        &request(&u, &u.sha, &headers),
    )
    .await
    .unwrap();
    assert_eq!(
        path,
        cache.path().join("reader").join(format!("{}.epub", u.sha))
    );
    assert_eq!(std::fs::read(&path).unwrap(), u.bytes);

    // The second time nothing is asked of the library: a wrong file id would be a 404.
    let again = ReaderFile {
        file_id: "nonexistent",
        ..request(&u, &u.sha, &headers)
    };
    let second = fetch(&store, app, cache.path(), &again).await.unwrap();
    assert_eq!(second, path);
    assert_eq!(
        names(&cache.path().join("reader")),
        vec![format!("{}.epub", u.sha)]
    );
}

#[test]
fn the_cache_keeps_ten_files() {
    let dir = tempfile::tempdir().unwrap();
    let now = std::time::SystemTime::now();
    for i in 0..13u64 {
        let p = dir.path().join(format!("{i:064x}.epub"));
        let f = std::fs::File::create(&p).unwrap();
        // File 0 is the oldest, 12 the newest.
        f.set_modified(now - std::time::Duration::from_secs(1000 - i * 10))
            .unwrap();
    }
    let oldest = dir.path().join(format!("{:064x}.epub", 0));
    prune(dir.path(), KEEP, &oldest);
    let left = names(dir.path());
    assert_eq!(KEEP, 10);
    assert_eq!(left.len(), 10);
    // The file just served stays even when it is the oldest; the next oldest go instead.
    assert!(left.contains(&format!("{:064x}.epub", 0)));
    assert!(!left.contains(&format!("{:064x}.epub", 1)));
    assert!(!left.contains(&format!("{:064x}.epub", 2)));
    assert!(left.contains(&format!("{:064x}.epub", 12)));
}

#[tokio::test]
async fn a_wrong_sha_is_refused_and_nothing_stays() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let u = upload(&app, &token).await;
    let (_d, store) = store();
    let cache = tempfile::tempdir().unwrap();
    let headers = bearer(&u.token);
    let wrong = "0".repeat(64);

    let err = fetch(
        &store,
        app.clone(),
        cache.path(),
        &request(&u, &wrong, &headers),
    )
    .await
    .unwrap_err();
    assert!(err.contains("checksum"), "{err}");
    assert!(names(&cache.path().join("reader")).is_empty());

    // A malformed hash never reaches the disk path.
    let bad = fetch(&store, app, cache.path(), &request(&u, "../../x", &headers)).await;
    assert!(bad.is_err());
}

#[tokio::test]
async fn a_remote_library_streams_the_file() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let u = upload(&app, &token).await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let served = app.clone();
    tokio::spawn(async move { axum::serve(listener, served).await.unwrap() });

    let (_d, store) = store();
    let conn = Connection {
        id: uuid::Uuid::now_v7().to_string(),
        kind: ConnectionKind::Remote,
        url: Some(url),
        fingerprint: None,
        library_name: None,
        user_name: None,
        device_id: None,
        access_token: None,
        refresh_token: None,
    };
    store.upsert(conn.clone()).unwrap();
    let cache = tempfile::tempdir().unwrap();
    let headers = bearer(&u.token);
    let req = ReaderFile {
        connection_id: Some(&conn.id),
        ..request(&u, &u.sha, &headers)
    };
    // The core handed to `fetch` is a different, empty library: only the server has the book.
    let other = router(AppState::for_tests());
    let path = fetch(&store, other, cache.path(), &req).await.unwrap();
    assert_eq!(std::fs::read(path).unwrap(), u.bytes);

    let refused = ReaderFile {
        file_id: "nonexistent",
        sha256: &"1".repeat(64),
        ..req
    };
    assert!(fetch(
        &store,
        router(AppState::for_tests()),
        cache.path(),
        &refused
    )
    .await
    .is_err());
}
