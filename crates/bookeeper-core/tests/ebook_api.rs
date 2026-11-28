mod common;

use std::io::{Cursor, Write};
use std::time::Duration;

use axum::body::Body;
use axum::http::{HeaderMap, Request};
use bookeeper_core::api::ebook_files;
use bookeeper_core::auth::Role;
use bookeeper_core::{router, AppState};
use common::*;
use http_body_util::BodyExt;
use image::{DynamicImage, ImageFormat, RgbImage};
use serde_json::{json, Value};
use tokio::sync::RwLock;
use tower::ServiceExt;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

/// Uploads read the size limit from the environment. The tests that change it,
/// or that measure memory, take this lock alone; every other upload shares it.
static LOCK: RwLock<()> = RwLock::const_new(());

// ------------------------------------------------------------------ fixtures

fn cover_png() -> Vec<u8> {
    let img = RgbImage::from_fn(120, 160, |x, y| {
        image::Rgb([(x * 2) as u8, (y * 3) as u8, 90])
    });
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(img)
        .write_to(&mut out, ImageFormat::Png)
        .unwrap();
    out.into_inner()
}

/// An EPUB; `extra` are more archive entries. `title` goes in the metadata.
fn epub(title: &str, extra: &[(&str, &str)], with_cover: bool) -> Vec<u8> {
    let mut buf = Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default();
        z.start_file("mimetype", stored).unwrap();
        z.write_all(b"application/epub+zip").unwrap();
        z.start_file("META-INF/container.xml", deflated).unwrap();
        z.write_all(
            br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
        )
        .unwrap();
        z.start_file("OEBPS/content.opf", deflated).unwrap();
        let cover_item = if with_cover {
            r#"<item id="c" href="cover.png" media-type="image/png" properties="cover-image"/>"#
        } else {
            ""
        };
        z.write_all(
            format!(
                r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="id">urn:isbn:9780306406157</dc:identifier>
  <dc:title>{title}</dc:title>
  <dc:creator>Umberto Eco</dc:creator>
  <dc:language>it</dc:language>
  <dc:publisher>Bompiani</dc:publisher>
  <dc:date>1980-05-01</dc:date>
  <dc:description>Un giallo medievale.</dc:description>
  <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>
 </metadata>
 <manifest>{cover_item}<item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/></manifest>
 <spine><itemref idref="p1"/></spine>
</package>"#
            )
            .as_bytes(),
        )
        .unwrap();
        if with_cover {
            z.start_file("OEBPS/cover.png", deflated).unwrap();
            z.write_all(&cover_png()).unwrap();
        }
        z.start_file("OEBPS/p1.xhtml", deflated).unwrap();
        z.write_all(b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>x</body></html>")
            .unwrap();
        for (name, body) in extra {
            z.start_file(*name, deflated).unwrap();
            z.write_all(body.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }
    buf.into_inner()
}

/// Content that is not an e-book but gets a size: a PDF with `filler` bytes.
fn pdf_with(filler: usize) -> Vec<u8> {
    let mut v = b"%PDF-1.4\n".to_vec();
    v.extend(std::iter::repeat_n(b'%', filler));
    v.extend_from_slice(
        b"\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Size 2 >>\nstartxref\n0\n%%EOF\n",
    );
    v
}

// ------------------------------------------------------------------ requests

async fn send(
    state: &AppState,
    method: &str,
    uri: &str,
    token: &str,
    headers: &[(&str, &str)],
    body: Body,
) -> (u16, HeaderMap, Vec<u8>) {
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header("authorization", format!("Bearer {token}"));
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let resp = router(state.clone())
        .oneshot(req.body(body).unwrap())
        .await
        .unwrap();
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (status, headers, bytes)
}

fn json_of(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap_or(Value::Null)
}

fn upload_uri(name: &str) -> String {
    format!("/api/v1/ebook-files?name={}", name.replace(' ', "%20"))
}

async fn upload(s: &Seeded, name: &str, bytes: Vec<u8>) -> (u16, Value) {
    let _g = LOCK.read().await;
    let (st, _, b) = send(
        &s.state,
        "PUT",
        &upload_uri(name),
        &s.session.access_token,
        &[],
        Body::from(bytes),
    )
    .await;
    (st, json_of(&b))
}

async fn member() -> Seeded {
    seed(Role::Member, None, None).await
}

fn sha_of(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

async fn attach(s: &Seeded, book: &str, sha: &str, name: &str) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        &format!("/api/v1/books/{book}/files"),
        Some(&s.session.access_token),
        Some(json!({"sha256": sha, "name": name})),
    )
    .await;
    (st, b)
}

/// Uploads `bytes` and attaches them to `book`; returns the file id.
async fn upload_and_attach(s: &Seeded, book: &str, name: &str, bytes: Vec<u8>) -> (String, String) {
    let (st, info) = upload(s, name, bytes).await;
    assert_eq!(st, 200, "{info}");
    let sha = info["sha256"].as_str().unwrap().to_string();
    let (st, f) = attach(s, book, &sha, name).await;
    assert_eq!(st, 201, "{f}");
    (f["id"].as_str().unwrap().to_string(), sha)
}

fn disk(s: &Seeded, sha: &str, ext: &str) -> std::path::PathBuf {
    s.state.files.ebooks_dir.join(format!("{sha}.{ext}"))
}

fn dir_names(s: &Seeded) -> Vec<String> {
    std::fs::read_dir(&s.state.files.ebooks_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

// ------------------------------------------------------------------ upload

#[tokio::test]
async fn an_epub_upload_answers_with_its_metadata() {
    let s = member().await;
    let bytes = epub("Il nome della rosa", &[], true);
    let (st, info) = upload(&s, "rosa.epub", bytes.clone()).await;
    assert_eq!(st, 200, "{info}");
    assert_eq!(info["sha256"], sha_of(&bytes));
    assert_eq!(info["format"], "epub");
    assert_eq!(info["size_bytes"], bytes.len());
    assert_eq!(info["name"], "rosa.epub");
    assert_eq!(info["has_cover"], true);
    let m = &info["metadata"];
    assert_eq!(m["title"], "Il nome della rosa");
    assert_eq!(m["authors"], json!(["Umberto Eco"]));
    assert_eq!(m["language"], "it");
    assert_eq!(m["publisher"], "Bompiani");
    assert_eq!(m["published_year"], 1980);
    assert_eq!(m["isbn_13"], "9780306406157");
    assert_eq!(m["description"], "Un giallo medievale.");
    assert!(disk(&s, &sha_of(&bytes), "epub").is_file());
    // The same bytes again do not make a second file.
    let (st, again) = upload(&s, "copia.epub", bytes).await;
    assert_eq!(st, 200);
    assert_eq!(again["sha256"], info["sha256"]);
    assert_eq!(dir_names(&s).len(), 1);
}

#[tokio::test]
async fn bad_uploads_are_refused_and_leave_nothing() {
    let s = member().await;
    let (st, b) = upload(&s, "note.txt", b"just some text".to_vec()).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (415, Some("unsupported_format"))
    );
    let (st, b) = upload(
        &s,
        "drm.epub",
        epub("Protetto", &[("META-INF/rights.xml", "<rights/>")], false),
    )
    .await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("drm_protected")));
    let (st, _) = upload(&s, "  ", epub("x", &[], false)).await;
    assert_eq!(st, 422);
    assert!(dir_names(&s).is_empty(), "{:?}", dir_names(&s));
}

#[tokio::test]
async fn a_file_over_the_limit_is_413_and_leaves_no_temporary() {
    let _g = LOCK.write().await;
    std::env::set_var("BOOKEEPER_EBOOK_MAX_MB", "1");
    let s = member().await;
    let big = pdf_with(1_500_000);
    // Without a declared length the body is cut while streaming.
    let (st, _, b) = send(
        &s.state,
        "PUT",
        &upload_uri("big.pdf"),
        &s.session.access_token,
        &[],
        Body::from_stream(futures_util::stream::iter(
            big.chunks(64 * 1024)
                .map(|c| Ok::<_, std::io::Error>(c.to_vec()))
                .collect::<Vec<_>>(),
        )),
    )
    .await;
    assert_eq!(st, 413, "{}", String::from_utf8_lossy(&b));
    assert_eq!(json_of(&b)["error_code"], "payload_too_large");
    // With a declared length it is refused before reading.
    let len = big.len().to_string();
    let (st, _, _) = send(
        &s.state,
        "PUT",
        &upload_uri("big.pdf"),
        &s.session.access_token,
        &[("content-length", &len)],
        Body::from(big),
    )
    .await;
    assert_eq!(st, 413);
    // Under the limit it still works.
    let (st, _, _) = send(
        &s.state,
        "PUT",
        &upload_uri("ok.pdf"),
        &s.session.access_token,
        &[],
        Body::from(pdf_with(100)),
    )
    .await;
    assert_eq!(st, 200);
    std::env::remove_var("BOOKEEPER_EBOOK_MAX_MB");
    let names = dir_names(&s);
    assert_eq!(names.len(), 1, "{names:?}");
    assert!(names[0].ends_with(".pdf"));
}

fn rss_peak_kb() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let line = status.lines().find(|l| l.starts_with("VmHWM:"))?;
    line.split_whitespace().nth(1)?.parse().ok()
}

#[tokio::test]
async fn a_50_mb_upload_does_not_grow_the_memory_with_the_file() {
    const TOTAL: usize = 50 << 20;
    const CHUNK: usize = 64 * 1024;
    let _g = LOCK.write().await;
    let s = member().await;
    // The body is generated on the fly: it is never whole in the test either.
    let head = b"%PDF-1.4\n".to_vec();
    let tail = b"\ntrailer\n<< /Root 1 0 R /Size 2 >>\nstartxref\n0\n%%EOF\n".to_vec();
    let middle = TOTAL - head.len() - tail.len();
    // (head, bytes of filler left, tail) -> the next chunk.
    let chunks = futures_util::stream::unfold(
        (Some(head), middle, Some(tail)),
        |(head, left, tail)| async move {
            if let Some(h) = head {
                return Some((Ok::<_, std::io::Error>(h), (None, left, tail)));
            }
            if left > 0 {
                let n = left.min(CHUNK);
                return Some((Ok(vec![b'%'; n]), (None, left - n, tail)));
            }
            tail.map(|t| (Ok(t), (None, 0, None)))
        },
    );
    let measured = std::fs::write("/proc/self/clear_refs", "5").is_ok();
    let before = rss_peak_kb();
    let (st, _, b) = send(
        &s.state,
        "PUT",
        &upload_uri("big.pdf"),
        &s.session.access_token,
        &[],
        Body::from_stream(chunks),
    )
    .await;
    let after = rss_peak_kb();
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&b));
    assert_eq!(json_of(&b)["size_bytes"], TOTAL);
    match (measured, before, after) {
        (true, Some(before), Some(after)) => {
            let grown_mb = after.saturating_sub(before) / 1024;
            eprintln!(
                "peak RSS: {} MB before, {} MB after",
                before / 1024,
                after / 1024
            );
            assert!(
                grown_mb < 25,
                "memory grew by {grown_mb} MB for a 50 MB upload"
            );
        }
        _ => eprintln!("RSS not measurable on this platform: memory check skipped"),
    }
}

// ------------------------------------------------------------------ attach

#[tokio::test]
async fn attach_gives_201_and_the_book_lists_the_format_once() {
    let s = member().await;
    let book = insert_book(&s.state, &s.library_id, "Il nome della rosa").await;
    let (st, info) = upload(&s, "rosa.epub", epub("Rosa", &[], false)).await;
    assert_eq!(st, 200);
    let sha = info["sha256"].as_str().unwrap();
    let (st, f) = attach(&s, &book, sha, "rosa.epub").await;
    assert_eq!(st, 201, "{f}");
    assert_eq!(f["book_id"], book.as_str());
    assert_eq!(f["format"], "epub");
    assert_eq!(f["name"], "rosa.epub");
    assert_eq!(f["missing"], false);
    assert_eq!(f["size_bytes"], info["size_bytes"]);
    assert_eq!(f["uploaded_by"]["id"], s.user_id.as_str());
    assert_eq!(f["uploaded_by"]["display_name"], "Ada");
    assert!(f["id"].as_str().is_some() && f["created_at"].as_i64().is_some());
    let token = &s.session.access_token;
    let (_, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(b["file_formats"], json!(["epub"]));
    // The same file again: 409.
    let (st, again) = attach(&s, &book, sha, "rosa.epub").await;
    assert_eq!(
        (st, again["error_code"].as_str()),
        (409, Some("file_already_attached"))
    );
    // A pdf too: formats come alphabetical.
    upload_and_attach(&s, &book, "rosa.pdf", pdf_with(10)).await;
    let (_, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(b["file_formats"], json!(["epub", "pdf"]));
    // Unknown book, unknown hash, malformed hash.
    let (st, _) = attach(&s, "nope", sha, "x.epub").await;
    assert_eq!(st, 404);
    let (st, _) = attach(&s, &book, &"0".repeat(64), "x.epub").await;
    assert_eq!(st, 404);
    let (st, _) = attach(&s, &book, "zz", "x.epub").await;
    assert_eq!(st, 422);
    // A book without files has an empty list.
    let other = insert_book(&s.state, &s.library_id, "Altro").await;
    let (_, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{other}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(b["file_formats"], json!([]));
}

#[tokio::test]
async fn the_file_cover_goes_to_a_book_that_has_none() {
    let s = member().await;
    let token = &s.session.access_token;
    let has_cover = |book: String| {
        let (state, token) = (s.state.clone(), token.clone());
        async move {
            let (st, _, _) = call(
                &state,
                "GET",
                &format!("/api/v1/books/{book}/cover"),
                Some(&token),
                None,
            )
            .await;
            st
        }
    };
    let book = insert_book(&s.state, &s.library_id, "Con copertina").await;
    assert_eq!(has_cover(book.clone()).await, 404);
    upload_and_attach(&s, &book, "a.epub", epub("A", &[], true)).await;
    assert_eq!(has_cover(book.clone()).await, 200);

    // A book that has one keeps it; a file without a cover leaves none.
    let (_, _, before) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}"),
        Some(token),
        None,
    )
    .await;
    upload_and_attach(&s, &book, "b.epub", epub("B", &[], true)).await;
    let (_, _, after) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(before["cover_color"], after["cover_color"]);
    let plain = insert_book(&s.state, &s.library_id, "Senza").await;
    upload_and_attach(&s, &plain, "c.epub", epub("C", &[], false)).await;
    assert_eq!(has_cover(plain).await, 404);
}

#[tokio::test]
async fn the_cover_of_a_stored_file_is_a_jpeg() {
    let s = member().await;
    let token = s.session.access_token.clone();
    let (_, with) = upload(&s, "a.epub", epub("A", &[], true)).await;
    let (_, without) = upload(&s, "b.epub", epub("B", &[], false)).await;
    let uri = |i: &Value| {
        format!(
            "/api/v1/ebook-files/{}/cover",
            i["sha256"].as_str().unwrap()
        )
    };
    let (st, h, body) = send(&s.state, "GET", &uri(&with), &token, &[], Body::empty()).await;
    assert_eq!(st, 200);
    assert_eq!(h["content-type"], "image/jpeg");
    assert_eq!(&body[..3], &[0xff, 0xd8, 0xff]);
    let (st, _, _) = send(&s.state, "GET", &uri(&without), &token, &[], Body::empty()).await;
    assert_eq!(st, 404);
    let (st, _, _) = send(
        &s.state,
        "GET",
        &format!("/api/v1/ebook-files/{}/cover", "0".repeat(64)),
        &token,
        &[],
        Body::empty(),
    )
    .await;
    assert_eq!(st, 404);
}

// ------------------------------------------------------------------ list, download, detach

#[tokio::test]
async fn the_list_marks_a_file_missing_from_disk() {
    let s = member().await;
    let token = &s.session.access_token;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (id, sha) = upload_and_attach(&s, &book, "dune.pdf", pdf_with(10)).await;
    let (st, _, l) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(l.as_array().unwrap().len(), 1);
    assert_eq!(l[0]["id"], id.as_str());
    assert_eq!(l[0]["missing"], false);
    std::fs::remove_file(disk(&s, &sha, "pdf")).unwrap();
    let (_, _, l) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(l[0]["missing"], true);
    let (st, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files/{id}/content"),
        Some(token),
        None,
    )
    .await;
    assert_eq!((st, b["error_code"].as_str()), (404, Some("file_missing")));
    let (st, _, _) = call(
        &s.state,
        "GET",
        "/api/v1/books/nope/files",
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn download_names_the_file_and_serves_ranges() {
    let s = member().await;
    let token = s.session.access_token.clone();
    let bytes = pdf_with(2000);
    let book = insert_book(&s.state, &s.library_id, "Perché è così").await;
    // Give the book an author.
    let (st, _, _) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/books/{book}"),
        Some(&token),
        Some(json!({"authors": ["Lucia Müller"]})),
    )
    .await;
    assert_eq!(st, 200);
    let (id, _) = upload_and_attach(&s, &book, "original.pdf", bytes.clone()).await;
    let uri = format!("/api/v1/books/{book}/files/{id}/content");

    let (st, h, body) = send(&s.state, "GET", &uri, &token, &[], Body::empty()).await;
    assert_eq!(st, 200);
    assert_eq!(body, bytes);
    assert_eq!(h["content-type"], "application/pdf");
    assert_eq!(h["accept-ranges"], "bytes");
    assert_eq!(h["content-length"], bytes.len().to_string().as_str());
    let cd = h["content-disposition"].to_str().unwrap();
    assert!(cd.starts_with("attachment;"), "{cd}");
    assert!(
        cd.contains("filename=\"Lucia Muller - Perche e cosi.pdf\""),
        "{cd}"
    );
    assert!(
        cd.contains(
            "filename*=UTF-8''Lucia%20M%C3%BCller%20-%20Perch%C3%A9%20%C3%A8%20cos%C3%AC.pdf"
        ),
        "{cd}"
    );

    let (st, h, body) = send(
        &s.state,
        "GET",
        &uri,
        &token,
        &[("range", "bytes=0-99")],
        Body::empty(),
    )
    .await;
    assert_eq!(st, 206);
    assert_eq!(body.len(), 100);
    assert_eq!(body, bytes[..100]);
    assert_eq!(
        h["content-range"],
        format!("bytes 0-99/{}", bytes.len()).as_str()
    );
    assert_eq!(h["content-length"], "100");

    // Resuming an interrupted download: from the middle to the end, and a suffix.
    let (st, _, body) = send(
        &s.state,
        "GET",
        &uri,
        &token,
        &[("range", "bytes=1500-")],
        Body::empty(),
    )
    .await;
    assert_eq!((st, body), (206, bytes[1500..].to_vec()));
    let (st, _, body) = send(
        &s.state,
        "GET",
        &uri,
        &token,
        &[("range", "bytes=-50")],
        Body::empty(),
    )
    .await;
    assert_eq!((st, body), (206, bytes[bytes.len() - 50..].to_vec()));

    let beyond = format!("bytes={}-", bytes.len());
    let (st, h, b) = send(
        &s.state,
        "GET",
        &uri,
        &token,
        &[("range", &beyond)],
        Body::empty(),
    )
    .await;
    assert_eq!(st, 416);
    assert_eq!(json_of(&b)["error_code"], "range_not_satisfiable");
    assert_eq!(
        h["content-range"],
        format!("bytes */{}", bytes.len()).as_str()
    );

    // A range the server does not understand gets the whole file.
    let (st, _, body) = send(
        &s.state,
        "GET",
        &uri,
        &token,
        &[("range", "lines=1-2")],
        Body::empty(),
    )
    .await;
    assert_eq!((st, body.len()), (200, bytes.len()));
    // An unknown file.
    let (st, _, _) = send(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files/nope/content"),
        &token,
        &[],
        Body::empty(),
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn a_file_on_two_books_stays_until_the_last_one_lets_go() {
    let s = member().await;
    let token = &s.session.access_token;
    let (a, b) = (
        insert_book(&s.state, &s.library_id, "A").await,
        insert_book(&s.state, &s.library_id, "B").await,
    );
    let bytes = epub("Due libri", &[], false);
    let (id_a, sha) = upload_and_attach(&s, &a, "x.epub", bytes.clone()).await;
    let (st, fb) = attach(&s, &b, &sha, "x.epub").await;
    assert_eq!(st, 201);
    let id_b = fb["id"].as_str().unwrap();
    let path = disk(&s, &sha, "epub");

    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{a}/files/{id_a}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(path.is_file(), "still used by the other book");
    let (_, _, l) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{a}/files"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(l, json!([]));
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{a}/files/{id_a}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{a}/files/{id_b}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 404, "a file of another book");

    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{b}/files/{id_b}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(path.is_file(), "just uploaded: the grace period keeps it");
    // Past the grace period nobody uses it: the hourly sweep collects it.
    age(&path, 30);
    let removed = ebook_files::sweep_unattached(&s.state, Duration::from_secs(24 * 3600))
        .await
        .unwrap();
    assert_eq!(removed, 1);
    assert!(!path.exists(), "nobody uses it any more");
}

#[tokio::test]
async fn removing_an_old_unused_file_deletes_it_but_a_fresh_one_stays() {
    let s = member().await;
    let token = &s.session.access_token;
    let book = insert_book(&s.state, &s.library_id, "A").await;
    let (id, sha) = upload_and_attach(&s, &book, "x.epub", epub("Vecchio", &[], false)).await;
    let path = disk(&s, &sha, "epub");
    age(&path, 30);
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{book}/files/{id}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(!path.exists(), "older than the grace period and unused");

    // Re-uploaded just before the last book lets go: still there to attach.
    let bytes = epub("Vecchio", &[], false);
    let (id, sha) = upload_and_attach(&s, &book, "x.epub", bytes).await;
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{book}/files/{id}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let (st, _) = attach(&s, &book, &sha, "x.epub").await;
    assert_eq!(st, 201, "the freshly uploaded file survived the removal");
}

#[tokio::test]
async fn deleting_a_book_deletes_the_files_nobody_else_uses() {
    let s = member().await;
    let token = &s.session.access_token;
    let (a, b, c) = (
        insert_book(&s.state, &s.library_id, "A").await,
        insert_book(&s.state, &s.library_id, "B").await,
        insert_book(&s.state, &s.library_id, "C").await,
    );
    let (_, shared) = upload_and_attach(&s, &a, "s.epub", epub("Shared", &[], false)).await;
    attach(&s, &b, &shared, "s.epub").await;
    let (_, own) = upload_and_attach(&s, &a, "own.pdf", pdf_with(5)).await;
    let (_, batch_own) = upload_and_attach(&s, &c, "c.pdf", pdf_with(6)).await;

    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{a}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(!disk(&s, &own, "pdf").exists());
    assert!(disk(&s, &shared, "epub").is_file(), "book B still has it");

    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/books/batch-delete",
        Some(token),
        Some(json!({"ids": [b, c]})),
    )
    .await;
    assert_eq!(st, 200);
    assert!(!disk(&s, &shared, "epub").exists());
    assert!(!disk(&s, &batch_own, "pdf").exists());
}

// ------------------------------------------------------------------ roles and audit

#[tokio::test]
async fn guests_get_403_on_every_file_route() {
    let s = member().await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    let (id, sha) = upload_and_attach(&s, &book, "a.epub", epub("A", &[], true)).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let token = guest.access_token;
    let cases = [
        ("PUT", upload_uri("a.epub")),
        ("GET", format!("/api/v1/ebook-files/{sha}/cover")),
        ("POST", format!("/api/v1/books/{book}/files")),
        ("GET", format!("/api/v1/books/{book}/files")),
        ("GET", format!("/api/v1/books/{book}/files/{id}/content")),
        ("DELETE", format!("/api/v1/books/{book}/files/{id}")),
    ];
    for (method, uri) in cases {
        let headers: &[(&str, &str)] = if method == "POST" {
            &[("content-type", "application/json")]
        } else {
            &[]
        };
        let body = if method == "POST" {
            Body::from(json!({"sha256": sha, "name": "a.epub"}).to_string())
        } else if method == "PUT" {
            Body::from(epub("A", &[], true))
        } else {
            Body::empty()
        };
        let (st, _, b) = send(&s.state, method, &uri, &token, headers, body).await;
        assert_eq!(st, 403, "{method} {uri}: {}", String::from_utf8_lossy(&b));
    }
    // The guest still sees the card, with the formats.
    let (_, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}"),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(b["file_formats"], json!(["epub"]));
    // And nothing was changed.
    assert_eq!(dir_names(&s).len(), 1);
}

#[tokio::test]
async fn every_attach_and_detach_is_in_the_log() {
    let s = member().await;
    let token = &s.session.access_token;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    let (id, _) = upload_and_attach(&s, &book, "rosa.epub", epub("A", &[], false)).await;
    call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{book}/files/{id}"),
        Some(token),
        None,
    )
    .await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let file_rows: Vec<_> = rows
        .iter()
        .filter(|r| r.0.starts_with("book.file."))
        .collect();
    assert_eq!(
        file_rows,
        vec![
            &(
                "book.file.add".to_string(),
                "book".to_string(),
                book.clone()
            ),
            &(
                "book.file.remove".to_string(),
                "book".to_string(),
                book.clone()
            ),
        ]
    );
    let lib = s.library_id.clone();
    let details: Vec<String> = s
        .state
        .db
        .run(move |c| {
            let mut st = c.prepare(
                "SELECT detail_json FROM audit_log WHERE library_id = ?1 AND action LIKE 'book.file.%' ORDER BY id",
            )?;
            let rows = st.query_map([lib], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .unwrap();
    for d in details {
        let v: Value = serde_json::from_str(&d).unwrap();
        assert_eq!(v, json!({"format": "epub", "name": "rosa.epub"}));
    }
}

// ------------------------------------------------------------------ sweep

fn age(path: &std::path::Path, hours: u64) {
    let f = std::fs::OpenOptions::new().write(true).open(path).unwrap();
    f.set_modified(std::time::SystemTime::now() - Duration::from_secs(hours * 3600))
        .unwrap();
}

#[tokio::test]
async fn unattached_files_go_after_a_day_and_attached_ones_stay() {
    let s = member().await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    let (_, kept) = upload_and_attach(&s, &book, "k.epub", epub("K", &[], false)).await;
    let (_, orphan) = upload(&s, "o.pdf", pdf_with(7)).await;
    let (_, fresh) = upload(&s, "f.pdf", pdf_with(8)).await;
    let orphan = orphan["sha256"].as_str().unwrap().to_string();
    let fresh = fresh["sha256"].as_str().unwrap().to_string();
    age(&disk(&s, &kept, "epub"), 48);
    age(&disk(&s, &orphan, "pdf"), 25);
    let removed = ebook_files::sweep_unattached(&s.state, Duration::from_secs(24 * 3600))
        .await
        .unwrap();
    assert_eq!(removed, 1);
    assert!(disk(&s, &kept, "epub").is_file());
    assert!(!disk(&s, &orphan, "pdf").exists());
    assert!(disk(&s, &fresh, "pdf").is_file(), "under a day old");
}

#[tokio::test]
async fn the_router_sweeps_at_startup_but_only_once_an_hour() {
    let s = member().await;
    let stale_file = |s: &Seeded, c: &str, n: usize| {
        let p = s
            .state
            .files
            .ebooks_dir
            .join(format!("{}.pdf", c.repeat(64)));
        std::fs::write(&p, pdf_with(n)).unwrap();
        age(&p, 30);
        p
    };
    // The router starts the sweep and marks the folder as swept: asking again
    // right away finds nothing due.
    let probe = stale_file(&s, "b", 5);
    let _ = router(s.state.clone());
    assert!(
        bookeeper_core::api::ebook_files::maybe_sweep(&s.state).is_none(),
        "the router's startup sweep was the one of this hour"
    );
    // Its result is observable once the probe is gone (bounded wait on the
    // condition, not on a duration).
    for _ in 0..600 {
        if !probe.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(!probe.exists(), "startup sweep did not finish");
    // A file that becomes stale later is not swept: nothing is due.
    let late = stale_file(&s, "c", 6);
    let _ = router(s.state.clone());
    assert!(bookeeper_core::api::ebook_files::maybe_sweep(&s.state).is_none());
    assert!(late.is_file(), "throttled to once an hour");

    // A new data folder, as at the next start: swept in the background, and
    // the signal says when.
    let s2 = member().await;
    let stale = stale_file(&s2, "a", 3);
    let done =
        bookeeper_core::api::ebook_files::maybe_sweep(&s2.state).expect("a new folder is due");
    done.await.unwrap();
    assert!(!stale.exists(), "startup sweep");
}

#[tokio::test]
async fn files_list_the_sha256() {
    let s = member().await;
    let token = &s.session.access_token;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (id, sha) = upload_and_attach(&s, &book, "dune.pdf", pdf_with(10)).await;
    let (st, _, l) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(l[0]["sha256"], sha.as_str());
    // The content's ETag carries the same value.
    let (_, h, _) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/files/{id}/content"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(
        h.get("etag").unwrap().to_str().unwrap(),
        format!("\"{sha}\"")
    );
}
