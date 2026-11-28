//! A local library answers with the session: the in-process core gets `Authorization`
//! exactly as a remote server does.

use std::collections::BTreeMap;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use bookeeper_core::{router, AppState};
use bookeeper_desktop_lib::download::open_core;
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

#[tokio::test]
async fn a_local_library_answers_with_the_session() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let r = dispatch(app, "GET", "/api/v1/books", None, bearer(&token)).await;
    assert_eq!(r.status, 200, "{}", r.body);
}

#[tokio::test]
async fn a_local_library_still_refuses_without_a_session() {
    let app = router(AppState::for_tests());
    setup(&app).await;
    let r = dispatch(app, "GET", "/api/v1/books", None, BTreeMap::new()).await;
    assert_eq!(r.status, 401, "{}", r.body);
}

#[tokio::test]
async fn a_local_download_answers_with_the_session() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let bytes = tiny_epub();

    let up = dispatch_raw(
        app.clone(),
        "PUT",
        "/api/v1/ebook-files?name=libro.epub",
        Some(STANDARD.encode(&bytes)),
        Some("application/octet-stream".to_owned()),
        bearer(&token),
    )
    .await;
    assert_eq!(
        up.status,
        200,
        "{}",
        String::from_utf8_lossy(&STANDARD.decode(&up.body_base64).unwrap())
    );
    let info: Value = serde_json::from_slice(&STANDARD.decode(&up.body_base64).unwrap()).unwrap();
    let sha = info["sha256"].as_str().unwrap();

    let r = dispatch(
        app.clone(),
        "POST",
        "/api/v1/books",
        Some(json!({"title": "Libro"}).to_string()),
        bearer(&token),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let book: Value = serde_json::from_str(&r.body).unwrap();
    let book = book["id"].as_str().unwrap();

    let r = dispatch(
        app.clone(),
        "POST",
        &format!("/api/v1/books/{book}/files"),
        Some(json!({"sha256": sha, "name": "libro.epub"}).to_string()),
        bearer(&token),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let file: Value = serde_json::from_str(&r.body).unwrap();
    let path = format!(
        "/api/v1/books/{book}/files/{}/content",
        file["id"].as_str().unwrap()
    );

    let refused = open_core(app.clone(), &path, &BTreeMap::new())
        .await
        .unwrap();
    assert_eq!(refused.status, 401);

    let mut opened = open_core(app, &path, &bearer(&token)).await.unwrap();
    assert_eq!(opened.status, 200);
    let mut got = Vec::new();
    while let Some(chunk) = opened.source.chunk().await.unwrap() {
        got.extend_from_slice(&chunk);
    }
    assert_eq!(got, bytes);
}
