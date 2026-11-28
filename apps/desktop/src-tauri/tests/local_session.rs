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

/// A 96x128 PNG (the core wants at least 80x80), uncompressed (stored zlib blocks): enough for the core to decode.
fn cover_png() -> Vec<u8> {
    let (w, h) = (96u32, 128u32);
    let mut raw = Vec::new();
    for y in 0..h {
        raw.push(0); // filter: none
        for x in 0..w {
            raw.extend([(x * 7) as u8, (y * 5) as u8, 90]);
        }
    }
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(60_000).collect();
    for (i, b) in blocks.iter().enumerate() {
        z.push(u8::from(i + 1 == blocks.len()));
        z.extend((b.len() as u16).to_le_bytes());
        z.extend((!(b.len() as u16)).to_le_bytes());
        z.extend(*b);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &v in &raw {
        a = (a + u32::from(v)) % 65521;
        b = (b + a) % 65521;
    }
    z.extend(((b << 16) | a).to_be_bytes());
    let chunk = |out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]| {
        out.extend((data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend(data);
        out.extend(&body);
        out.extend(crc32(&body).to_be_bytes());
    };
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend(w.to_be_bytes());
    ihdr.extend(h.to_be_bytes());
    ihdr.extend([8, 2, 0, 0, 0]); // 8 bit, RGB
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    out
}

/// An archive of stored (uncompressed) entries.
fn stored_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in entries {
        let offset = out.len() as u32;
        let crc = crc32(data);
        let name = name.as_bytes();
        let common = |v: &mut Vec<u8>| {
            v.extend(20u16.to_le_bytes());
            v.extend(0u16.to_le_bytes());
            v.extend(0u16.to_le_bytes()); // stored
            v.extend(0u16.to_le_bytes());
            v.extend(0x21u16.to_le_bytes());
            v.extend(crc.to_le_bytes());
            v.extend((data.len() as u32).to_le_bytes());
            v.extend((data.len() as u32).to_le_bytes());
            v.extend((name.len() as u16).to_le_bytes());
        };
        out.extend(b"PK\x03\x04");
        common(&mut out);
        out.extend(0u16.to_le_bytes());
        out.extend(name);
        out.extend(*data);
        central.extend(b"PK\x01\x02");
        central.extend(20u16.to_le_bytes());
        common(&mut central);
        central.extend([0u8; 8]); // extra, comment, disk, internal attrs
        central.extend(0u32.to_le_bytes());
        central.extend(offset.to_le_bytes());
        central.extend(name);
    }
    let start = out.len() as u32;
    out.extend(&central);
    out.extend(b"PK\x05\x06");
    out.extend([0u8; 4]);
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((central.len() as u32).to_le_bytes());
    out.extend(start.to_le_bytes());
    out.extend(0u16.to_le_bytes());
    out
}

/// An EPUB whose manifest names a cover image.
fn epub_with_cover() -> Vec<u8> {
    let container = br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#;
    let opf = br#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="id">urn:isbn:9780306406157</dc:identifier>
  <dc:title>Libro</dc:title>
  <dc:language>it</dc:language>
  <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>
 </metadata>
 <manifest><item id="c" href="cover.png" media-type="image/png" properties="cover-image"/><item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/></manifest>
 <spine><itemref idref="p1"/></spine>
</package>"#;
    stored_zip(&[
        ("mimetype", b"application/epub+zip"),
        ("META-INF/container.xml", container),
        ("OEBPS/content.opf", opf),
        ("OEBPS/cover.png", &cover_png()),
        (
            "OEBPS/p1.xhtml",
            b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>x</body></html>",
        ),
    ])
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

#[tokio::test]
async fn a_local_raw_request_answers_with_the_session() {
    let app = router(AppState::for_tests());
    let token = setup(&app).await;
    let body = Some(STANDARD.encode(epub_with_cover()));
    let path = "/api/v1/ebook-files?name=libro.epub";
    let ct = || Some("application/octet-stream".to_owned());

    let refused = dispatch_raw(
        app.clone(),
        "PUT",
        path,
        body.clone(),
        ct(),
        BTreeMap::new(),
    )
    .await;
    assert_eq!(refused.status, 401);

    let up = dispatch_raw(app.clone(), "PUT", path, body, ct(), bearer(&token)).await;
    assert_eq!(up.status, 200);
    let info: Value = serde_json::from_slice(&STANDARD.decode(&up.body_base64).unwrap()).unwrap();
    let sha = info["sha256"].as_str().unwrap();

    // A binary read, in the process, with the session: the cover the core extracts from the
    // stored file comes back as a JPEG (not just "anything but 401").
    let cover = dispatch_raw(
        app,
        "GET",
        &format!("/api/v1/ebook-files/{sha}/cover"),
        None,
        None,
        bearer(&token),
    )
    .await;
    assert_eq!(cover.status, 200);
    let jpeg = STANDARD.decode(&cover.body_base64).unwrap();
    assert!(jpeg.starts_with(&[0xFF, 0xD8, 0xFF]), "not a JPEG");
}
