mod common;

use std::io::{Cursor, Read, Write};
use std::net::TcpListener;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{HeaderMap, Request};
use bookeeper_core::auth::Role;
use bookeeper_core::covers::{self, process};
use bookeeper_core::{router, AppState};
use common::*;
use http_body_util::BodyExt;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use tower::ServiceExt;

// ------------------------------------------------------------------ image helpers

fn solid(w: u32, h: u32, rgb: [u8; 3]) -> RgbImage {
    RgbImage::from_pixel(w, h, Rgb(rgb))
}

/// A busy picture so that compression does not shrink it to nothing.
fn noisy(w: u32, h: u32) -> RgbImage {
    RgbImage::from_fn(w, h, |x, y| {
        Rgb([
            (x * 7 + y * 3) as u8,
            ((x * 5) ^ (y * 11)) as u8,
            ((x + y) * 13) as u8,
        ])
    })
}

fn encode(img: &RgbImage, fmt: ImageFormat) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(img.clone())
        .write_to(&mut out, fmt)
        .unwrap();
    out.into_inner()
}

fn png(w: u32, h: u32, rgb: [u8; 3]) -> Vec<u8> {
    encode(&solid(w, h, rgb), ImageFormat::Png)
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// A PNG that is only a signature and an IHDR declaring the given size.
fn png_header_only(w: u32, h: u32) -> Vec<u8> {
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(b"IHDR");
    ihdr.extend_from_slice(&w.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    out.extend_from_slice(&13u32.to_be_bytes());
    out.extend_from_slice(&ihdr);
    out.extend_from_slice(&crc32(&ihdr).to_be_bytes());
    out
}

fn dims(jpeg: &[u8]) -> (u32, u32) {
    let img = image::load_from_memory(jpeg).unwrap();
    (img.width(), img.height())
}

// ------------------------------------------------------------------ processing

#[test]
fn jpeg_png_and_webp_are_accepted() {
    let img = noisy(200, 300);
    for fmt in [ImageFormat::Jpeg, ImageFormat::Png, ImageFormat::WebP] {
        let out = process(&encode(&img, fmt)).unwrap_or_else(|e| panic!("{fmt:?}: {e}"));
        assert_eq!(image::guess_format(&out.jpeg).unwrap(), ImageFormat::Jpeg);
        assert_eq!(dims(&out.jpeg), (200, 300));
        assert!(out.color.starts_with('#') && out.color.len() == 7);
    }
}

#[test]
fn gif_text_and_truncated_files_are_rejected() {
    let mut gif = b"GIF89a".to_vec();
    gif.extend_from_slice(&[100, 0, 100, 0, 0, 0, 0, 0x3b]);
    assert!(process(&gif).is_err());
    assert!(process(b"just some text, not an image at all").is_err());
    assert!(process(&[]).is_err());
    let full = encode(&noisy(300, 300), ImageFormat::Png);
    assert!(process(&full[..full.len() / 2]).is_err());
    let full = encode(&noisy(300, 300), ImageFormat::Jpeg);
    assert!(process(&full[..full.len() / 2]).is_err());
}

#[test]
fn large_images_are_downscaled_to_1200() {
    let out = process(&png(2400, 1600, [10, 120, 200])).unwrap();
    assert_eq!(dims(&out.jpeg), (1200, 800));
    let out = process(&png(1000, 3000, [10, 120, 200])).unwrap();
    assert_eq!(dims(&out.jpeg), (400, 1200));
}

#[test]
fn small_images_are_not_upscaled() {
    let out = process(&png(100, 130, [10, 120, 200])).unwrap();
    assert_eq!(dims(&out.jpeg), (100, 130));
}

#[test]
fn tiny_images_are_rejected() {
    assert!(process(&png(79, 400, [1, 2, 3])).is_err());
    assert!(process(&png(400, 79, [1, 2, 3])).is_err());
    assert!(process(&png(40, 40, [1, 2, 3])).is_err());
    assert!(process(&png(80, 80, [1, 2, 3])).is_ok());
}

#[test]
fn declared_huge_dimensions_are_rejected_before_decoding() {
    // Only a header: decoding would fail anyway, but the size check must fire first.
    assert!(process(&png_header_only(50_000, 50_000)).is_err());
    assert!(process(&png_header_only(12_001, 100)).is_err());
    // 100 megapixels with both sides within 12,000.
    assert!(process(&png_header_only(10_000, 10_000)).is_err());
}

#[test]
fn dominant_colour_of_a_red_image_is_red() {
    let out = process(&png(200, 200, [255, 0, 0])).unwrap();
    let v = u32::from_str_radix(&out.color[1..], 16).unwrap();
    let (r, g, b) = ((v >> 16) & 255, (v >> 8) & 255, v & 255);
    assert!(r > 230 && g < 25 && b < 25, "{}", out.color);
    // A white page with a red block: the near-white pixels do not dilute the colour.
    let mut img = solid(200, 200, [255, 255, 255]);
    for y in 60..140 {
        for x in 60..140 {
            img.put_pixel(x, y, Rgb([255, 0, 0]));
        }
    }
    let out = process(&encode(&img, ImageFormat::Png)).unwrap();
    let v = u32::from_str_radix(&out.color[1..], 16).unwrap();
    assert!(
        ((v >> 16) & 255) > 200 && ((v >> 8) & 255) < 80,
        "{}",
        out.color
    );
    // Deterministic.
    assert_eq!(
        out.color,
        process(&encode(&img, ImageFormat::Png)).unwrap().color
    );
}

#[test]
fn output_has_no_exif() {
    let jpeg = encode(&noisy(160, 160), ImageFormat::Jpeg);
    let payload = b"Exif\0\0MM\0*secret-gps-data";
    let mut with_exif = jpeg[..2].to_vec();
    with_exif.extend_from_slice(&[0xff, 0xe1]);
    with_exif.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
    with_exif.extend_from_slice(payload);
    with_exif.extend_from_slice(&jpeg[2..]);
    assert!(with_exif.windows(4).any(|w| w == b"Exif"));
    let out = process(&with_exif).unwrap();
    assert!(!out.jpeg.windows(4).any(|w| w == b"Exif"));
    assert!(!out.jpeg.windows(6).any(|w| w == b"secret"));
}

// ------------------------------------------------------------------ http helpers

async fn raw(
    state: &AppState,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Vec<u8>,
    extra: &[(&str, &str)],
) -> (u16, HeaderMap, Vec<u8>) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    for (k, v) in extra {
        req = req.header(*k, *v);
    }
    let resp = router(state.clone())
        .oneshot(req.body(Body::from(body)).unwrap())
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

fn code(body: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(body)
        .map(|v| v["error_code"].as_str().unwrap_or("").to_string())
        .unwrap_or_default()
}

async fn put(s: &Seeded, id: &str, body: Vec<u8>) -> (u16, HeaderMap, Vec<u8>) {
    raw(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{id}/cover"),
        Some(&s.session.access_token),
        body,
        &[],
    )
    .await
}

async fn get(s: &Seeded, id: &str, extra: &[(&str, &str)]) -> (u16, HeaderMap, Vec<u8>) {
    raw(
        &s.state,
        "GET",
        &format!("/api/v1/books/{id}/cover"),
        Some(&s.session.access_token),
        vec![],
        extra,
    )
    .await
}

async fn setup() -> (Seeded, String) {
    let s = seed(Role::Owner, None, None).await;
    let id = insert_book(&s.state, &s.library_id, "Dune").await;
    (s, id)
}

fn cover_file(s: &Seeded, id: &str) -> std::path::PathBuf {
    s.state.files.covers_dir.join(format!("{id}.jpg"))
}

// ------------------------------------------------------------------ routes

#[tokio::test]
async fn upload_then_get_round_trips() {
    let (s, id) = setup().await;
    let (st, _, body) = put(&s, &id, png(300, 400, [255, 0, 0])).await;
    assert_eq!(st, 200);
    let color = serde_json::from_slice::<serde_json::Value>(&body).unwrap()["cover_color"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(color.starts_with("#ff"), "{color}");
    let (st, h, bytes) = get(&s, &id, &[]).await;
    assert_eq!(st, 200);
    assert_eq!(h["content-type"], "image/jpeg");
    assert_eq!(dims(&bytes), (300, 400));
    assert_eq!(bytes, std::fs::read(cover_file(&s, &id)).unwrap());
    // Replacing keeps one file and no temporary leftovers.
    assert_eq!(put(&s, &id, png(200, 200, [0, 0, 255])).await.0, 200);
    let names: Vec<_> = std::fs::read_dir(&s.state.files.covers_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names, vec![format!("{id}.jpg")]);
}

#[tokio::test]
async fn get_supports_etag() {
    let (s, id) = setup().await;
    put(&s, &id, png(200, 200, [0, 200, 0])).await;
    let (st, h, bytes) = get(&s, &id, &[]).await;
    assert_eq!(st, 200);
    assert_eq!(h["cache-control"], "private, max-age=86400");
    let etag = h["etag"].to_str().unwrap().to_string();
    let (st, h2, body) = get(&s, &id, &[("if-none-match", &etag)]).await;
    assert_eq!(st, 304);
    assert!(body.is_empty());
    assert_eq!(h2["etag"].to_str().unwrap(), etag);
    let (st, _, again) = get(&s, &id, &[("if-none-match", "\"other\"")]).await;
    assert_eq!(st, 200);
    assert_eq!(again, bytes);
    // A new image gives a new tag.
    put(&s, &id, png(200, 200, [200, 0, 200])).await;
    let (st, h3, _) = get(&s, &id, &[("if-none-match", &etag)]).await;
    assert_eq!(st, 200);
    assert_ne!(h3["etag"].to_str().unwrap(), etag);
}

#[tokio::test]
async fn get_without_cover_is_cover_not_found() {
    let (s, id) = setup().await;
    let (st, _, body) = get(&s, &id, &[]).await;
    assert_eq!((st, code(&body).as_str()), (404, "cover_not_found"));
}

#[tokio::test]
async fn upload_over_five_megabytes_is_payload_too_large() {
    let (s, id) = setup().await;
    let (st, _, body) = put(&s, &id, vec![0u8; 5 * 1024 * 1024 + 1]).await;
    assert_eq!((st, code(&body).as_str()), (413, "payload_too_large"));
}

#[tokio::test]
async fn upload_of_garbage_is_unsupported_image() {
    let (s, id) = setup().await;
    let (st, _, body) = put(&s, &id, b"definitely not an image".to_vec()).await;
    assert_eq!((st, code(&body).as_str()), (400, "unsupported_image"));
    assert!(!cover_file(&s, &id).exists());
}

#[tokio::test]
async fn delete_is_idempotent() {
    let (s, id) = setup().await;
    let path = format!("/api/v1/books/{id}/cover");
    let del = || {
        raw(
            &s.state,
            "DELETE",
            &path,
            Some(&s.session.access_token),
            vec![],
            &[],
        )
    };
    assert_eq!(del().await.0, 204); // never had one
    put(&s, &id, png(200, 200, [1, 2, 3])).await;
    assert!(cover_file(&s, &id).exists());
    assert_eq!(del().await.0, 204);
    assert!(!cover_file(&s, &id).exists());
    assert_eq!(del().await.0, 204);
    assert_eq!(get(&s, &id, &[]).await.0, 404);
    let (_, _, book) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert!(book["cover_color"].is_null());
    let n = audit_rows(&s.state, &s.library_id)
        .await
        .iter()
        .filter(|r| r.0 == "book.cover_delete")
        .count();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn deleting_the_book_deletes_the_file() {
    let (s, id) = setup().await;
    put(&s, &id, png(200, 200, [1, 2, 3])).await;
    assert!(cover_file(&s, &id).exists());
    let (st, ..) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(!cover_file(&s, &id).exists());
}

#[tokio::test]
async fn batch_delete_deletes_the_files() {
    let (s, a) = setup().await;
    let b = insert_book(&s.state, &s.library_id, "Emma").await;
    let keep = insert_book(&s.state, &s.library_id, "Ulysses").await;
    for id in [&a, &b, &keep] {
        put(&s, id, png(200, 200, [9, 9, 9])).await;
    }
    let (st, _, body) = call(
        &s.state,
        "POST",
        "/api/v1/books/batch-delete",
        Some(&s.session.access_token),
        Some(serde_json::json!({ "ids": [a, b, "no-such-book"] })),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(body["deleted"], 2);
    assert!(!cover_file(&s, &a).exists());
    assert!(!cover_file(&s, &b).exists());
    assert!(cover_file(&s, &keep).exists());
}

#[tokio::test]
async fn book_out_carries_the_colour() {
    let (s, id) = setup().await;
    let (_, _, up) = put(&s, &id, png(200, 200, [0, 0, 255])).await;
    let color = serde_json::from_slice::<serde_json::Value>(&up).unwrap()["cover_color"].clone();
    let (st, _, book) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(book["cover_color"], color);
}

#[tokio::test]
async fn other_library_gets_not_found() {
    let (s, id) = setup().await;
    put(&s, &id, png(200, 200, [1, 2, 3])).await;
    let (_, other) = other_library(&s.state).await;
    let t = Some(other.access_token.as_str());
    let p = format!("/api/v1/books/{id}/cover");
    for method in ["GET", "PUT", "DELETE"] {
        let (st, _, body) = raw(&s.state, method, &p, t, png(200, 200, [1, 2, 3]), &[]).await;
        assert_eq!((st, code(&body).as_str()), (404, "not_found"), "{method}");
    }
    let (st, ..) = call(
        &s.state,
        "POST",
        &format!("{p}/fetch"),
        t,
        Some(serde_json::json!({ "candidates": ["https://example.com/a.png"] })),
    )
    .await;
    assert_eq!(st, 404);
    assert!(cover_file(&s, &id).exists());
}

#[tokio::test]
async fn guest_can_get_but_not_change() {
    let (s, id) = setup().await;
    put(&s, &id, png(200, 200, [1, 2, 3])).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gus").await;
    let t = Some(guest.access_token.as_str());
    let p = format!("/api/v1/books/{id}/cover");
    assert_eq!(raw(&s.state, "GET", &p, t, vec![], &[]).await.0, 200);
    for method in ["PUT", "DELETE"] {
        let (st, _, body) = raw(&s.state, method, &p, t, png(200, 200, [1, 2, 3]), &[]).await;
        assert_eq!((st, code(&body).as_str()), (403, "forbidden"), "{method}");
    }
    let (st, ..) = call(
        &s.state,
        "POST",
        &format!("{p}/fetch"),
        t,
        Some(serde_json::json!({ "candidates": ["https://example.com/a.png"] })),
    )
    .await;
    assert_eq!(st, 403);
}

#[tokio::test]
async fn routes_need_a_token() {
    let (s, id) = setup().await;
    let p = format!("/api/v1/books/{id}/cover");
    for method in ["GET", "PUT", "DELETE"] {
        let (st, _, body) = raw(&s.state, method, &p, None, vec![], &[]).await;
        assert_eq!(
            (st, code(&body).as_str()),
            (401, "unauthorized"),
            "{method}"
        );
    }
    let (st, ..) = call(
        &s.state,
        "POST",
        &format!("{p}/fetch"),
        None,
        Some(serde_json::json!({})),
    )
    .await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn mutations_are_audited() {
    let (s, id) = setup().await;
    put(&s, &id, png(200, 200, [1, 2, 3])).await;
    put(&s, &id, b"garbage".to_vec()).await; // failed: not audited
    let server = TestServer::start();
    let (st, ..) = call(
        &s.state,
        "POST",
        &format!("/api/v1/books/{id}/cover/fetch"),
        Some(&s.session.access_token),
        Some(serde_json::json!({ "candidates": [server.url("/img")] })),
    )
    .await;
    assert_eq!(st, 200);
    raw(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{id}/cover"),
        Some(&s.session.access_token),
        vec![],
        &[],
    )
    .await;
    let actions: Vec<String> = audit_rows(&s.state, &s.library_id)
        .await
        .into_iter()
        .filter(|r| r.0.starts_with("book.cover"))
        .inspect(|r| assert_eq!((r.1.as_str(), r.2.as_str()), ("book", id.as_str())))
        .map(|r| r.0)
        .collect();
    assert_eq!(actions, ["book.cover", "book.cover", "book.cover_delete"]);
}

// ------------------------------------------------------------------ local server

struct TestServer {
    port: u16,
}

impl TestServer {
    fn start() -> Arc<TestServer> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let image = Arc::new(png(300, 300, [20, 160, 60]));
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { break };
                let image = image.clone();
                std::thread::spawn(move || serve(stream, &image));
            }
        });
        Arc::new(TestServer { port })
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }
}

fn serve(mut stream: std::net::TcpStream, image: &[u8]) {
    let mut head = Vec::new();
    let mut buf = [0u8; 1024];
    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
        match stream.read(&mut buf) {
            Ok(0) | Err(_) => return,
            Ok(n) => head.extend_from_slice(&buf[..n]),
        }
    }
    let text = String::from_utf8_lossy(&head).to_string();
    let path = text.split_whitespace().nth(1).unwrap_or("/").to_string();
    let simple = |status: &str, ctype: &str, body: &[u8]| {
        let mut out = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        out.extend_from_slice(body);
        out
    };
    let reply = match path.as_str() {
        "/img" => simple("200 OK", "image/png", image),
        "/text" => simple("200 OK", "text/plain", b"hello, not an image"),
        "/big" => {
            // 6 MB, no Content-Length: the body ends when the connection closes.
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nConnection: close\r\n\r\n",
            );
            let chunk = vec![0u8; 64 * 1024];
            for _ in 0..96 {
                if stream.write_all(&chunk).is_err() {
                    return;
                }
            }
            return;
        }
        p if p.starts_with("/r/") => {
            let n: u32 = p[3..].parse().unwrap_or(0);
            let target = if n == 0 {
                "/img".to_string()
            } else {
                format!("/r/{}", n - 1)
            };
            format!(
                "HTTP/1.1 302 Found\r\nLocation: {target}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            )
            .into_bytes()
        }
        _ => simple("404 Not Found", "text/plain", b"nope"),
    };
    let _ = stream.write_all(&reply);
}

// ------------------------------------------------------------------ fetching

#[tokio::test]
async fn fetch_takes_the_first_valid_candidate() {
    let (s, id) = setup().await;
    let server = TestServer::start();
    let urls = [
        server.url("/missing"),
        server.url("/text"),
        server.url("/img"),
    ];
    let (st, _, body) = call(
        &s.state,
        "POST",
        &format!("/api/v1/books/{id}/cover/fetch"),
        Some(&s.session.access_token),
        Some(serde_json::json!({ "candidates": [urls[0], urls[1], urls[2], urls[0]] })),
    )
    .await;
    assert_eq!(st, 200, "{body}");
    assert_eq!(body["source_url"], urls[2].as_str());
    assert!(body["cover_color"].as_str().unwrap().starts_with('#'));
    assert_eq!(
        dims(&std::fs::read(cover_file(&s, &id)).unwrap()),
        (300, 300)
    );
}

#[tokio::test]
async fn fetch_with_no_valid_candidate_is_cover_fetch_failed() {
    let (s, id) = setup().await;
    let server = TestServer::start();
    let p = format!("/api/v1/books/{id}/cover/fetch");
    let t = Some(s.session.access_token.as_str());
    let (st, _, body) = call(
        &s.state,
        "POST",
        &p,
        t,
        Some(serde_json::json!({ "candidates": [server.url("/missing"), server.url("/text"), "not a url"] })),
    )
    .await;
    assert_eq!(st, 422);
    assert_eq!(body["error_code"], "cover_fetch_failed");
    assert!(!cover_file(&s, &id).exists());
    // Candidate count outside 1..=8 is a validation error.
    for list in [vec![], vec!["https://example.com/a.png"; 9]] {
        let (st, _, body) = call(
            &s.state,
            "POST",
            &p,
            t,
            Some(serde_json::json!({ "candidates": list })),
        )
        .await;
        assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
    }
}

#[tokio::test]
async fn fetch_stops_reading_at_the_size_limit() {
    let server = TestServer::start();
    let state = AppState::for_tests();
    let err = covers::fetch_guarded(&state, &server.url("/big"))
        .await
        .unwrap_err();
    assert!(err.0.contains("too large"), "{err}");
    let ok = covers::fetch_guarded(&state, &server.url("/img"))
        .await
        .unwrap();
    assert!(ok.len() < covers::MAX_BYTES);
}

#[tokio::test]
async fn fetch_follows_at_most_three_redirects() {
    let server = TestServer::start();
    let state = AppState::for_tests();
    assert!(covers::fetch_guarded(&state, &server.url("/r/2"))
        .await
        .is_ok());
    let err = covers::fetch_guarded(&state, &server.url("/r/3"))
        .await
        .unwrap_err();
    assert!(err.0.contains("redirect"), "{err}");
}

// ------------------------------------------------------------------ guard

fn strict() -> AppState {
    let mut s = AppState::for_tests();
    s.allow_private_fetch = false;
    s
}

#[tokio::test]
async fn guard_rejects_http_and_other_ports() {
    let state = strict();
    for url in [
        "http://example.com/a.png",
        "https://example.com:8443/a.png",
        "https://example.com:80/a.png",
        "ftp://example.com/a.png",
        "file:///etc/passwd",
        "not a url",
    ] {
        assert!(covers::fetch_guarded(&state, url).await.is_err(), "{url}");
    }
}

#[tokio::test]
async fn guard_rejects_loopback_private_and_link_local() {
    let state = strict();
    for host in [
        "127.0.0.1",
        "10.0.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "[::1]",
        "[fd00::1]",
        "[::ffff:127.0.0.1]",
        "0.0.0.0",
        "172.16.0.1",
        "[fe80::1]",
        "224.0.0.1",
        "localhost",
    ] {
        let url = format!("https://{host}/a.png");
        let err = covers::fetch_guarded(&state, &url).await.unwrap_err();
        assert!(
            err.0.contains("not allowed") || err.0.contains("resolve"),
            "{url}: {err}"
        );
    }
}

#[tokio::test]
async fn guard_rejects_credentials_in_the_url() {
    let state = strict();
    for url in [
        "https://user:pw@example.com/a.png",
        "https://user@example.com/a.png",
    ] {
        let err = covers::fetch_guarded(&state, url).await.unwrap_err();
        assert!(err.0.contains("credentials"), "{err}");
    }
}

#[test]
fn guard_rechecks_redirect_targets() {
    let base = reqwest::Url::parse("https://example.com/a/b").unwrap();
    for loc in [
        "http://example.com/x",
        "https://127.0.0.1/x",
        "https://10.0.0.1/x",
        "https://[::1]/x",
        "https://[::ffff:10.0.0.1]/x",
        "//169.254.169.254/latest",
        "https://example.com:8080/x",
        "https://user:pw@example.com/x",
    ] {
        assert!(covers::redirect_target(&base, loc, false).is_err(), "{loc}");
    }
    let ok = covers::redirect_target(&base, "/other.png", false).unwrap();
    assert_eq!(ok.as_str(), "https://example.com/other.png");
    // With the test switch the same private targets pass the syntactic check.
    assert!(covers::redirect_target(&base, "http://127.0.0.1:9/x", true).is_ok());
}
