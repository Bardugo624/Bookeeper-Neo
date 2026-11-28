//! Streaming download: a local server, the real client, a real file.

use std::collections::BTreeMap;
use std::net::SocketAddr;

use axum::body::Body;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use bookeeper_desktop_lib::download::{
    disposition_name, open_core, open_remote, write_stream, DownloadOutcome, Source,
};

const SIZE: usize = 6 * 1024 * 1024;

fn pattern(len: usize) -> Vec<u8> {
    (0..len).map(|i| (i % 251) as u8).collect()
}

async fn big(headers: HeaderMap) -> Response {
    // Echoes whether the session header arrived, so the test sees it was forwarded.
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("none")
        .to_owned();
    Response::builder()
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"Autore - Titolo.epub\"; filename*=UTF-8''Autore%20-%20Citt%C3%A0.epub",
        )
        .header("x-seen-auth", auth)
        .body(Body::from(pattern(SIZE)))
        .unwrap()
}

/// Promises 1000 bytes, sends 10 and hangs up.
async fn cutting_server() -> SocketAddr {
    use tokio::io::AsyncWriteExt;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                let _ = tokio::io::AsyncReadExt::read(&mut sock, &mut buf).await;
                let _ = sock
                    .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 1000\r\n\r\n0123456789")
                    .await;
                let _ = sock.shutdown().await;
            });
        }
    });
    addr
}

async fn serve() -> SocketAddr {
    let app = Router::new().route("/api/v1/big", get(big)).route(
        "/api/v1/missing",
        get(|| async { (StatusCode::NOT_FOUND, "no").into_response() }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    addr
}

fn auth(token: &str) -> BTreeMap<String, String> {
    BTreeMap::from([("Authorization".to_owned(), format!("Bearer {token}"))])
}

#[tokio::test]
async fn streams_a_big_body_to_the_file_with_the_session_header() {
    let addr = serve().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("out.epub");
    let url = format!("http://{addr}");
    let mut opened = open_remote(&url, None, "/api/v1/big", &auth("tok"))
        .await
        .unwrap();
    assert_eq!(opened.status, 200);
    let name = disposition_name(opened.disposition.as_deref().unwrap());
    assert_eq!(name.as_deref(), Some("Autore - Città.epub"));
    if let Source::Remote(r) = &opened.source {
        assert_eq!(r.headers()["x-seen-auth"], "Bearer tok");
    }
    let written = write_stream(&mut opened.source, &dest).await.unwrap();
    assert_eq!(written as usize, SIZE);
    assert_eq!(std::fs::read(&dest).unwrap(), pattern(SIZE));
    let leftovers: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
    assert_eq!(leftovers.len(), 1, "only the finished file remains");
}

#[tokio::test]
async fn a_refusal_is_reported_by_its_status_and_writes_nothing() {
    let addr = serve().await;
    let url = format!("http://{addr}");
    let opened = open_remote(&url, None, "/api/v1/missing", &BTreeMap::new())
        .await
        .unwrap();
    assert_eq!(opened.status, 404);
}

#[tokio::test]
async fn a_cut_download_leaves_no_file_and_keeps_the_old_one() {
    let addr = cutting_server().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("keep.epub");
    std::fs::write(&dest, b"old").unwrap();
    let url = format!("http://{addr}");
    let mut opened = open_remote(&url, None, "/api/v1/broken", &BTreeMap::new())
        .await
        .unwrap();
    assert!(write_stream(&mut opened.source, &dest).await.is_err());
    assert_eq!(std::fs::read(&dest).unwrap(), b"old");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[tokio::test]
async fn the_core_router_streams_too() {
    let router = Router::new().route("/api/v1/big", get(big));
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("local.epub");
    let mut opened = open_core(router, "/api/v1/big", &BTreeMap::new())
        .await
        .unwrap();
    assert_eq!(opened.status, 200);
    assert_eq!(
        write_stream(&mut opened.source, &dest).await.unwrap() as usize,
        SIZE
    );
    assert_eq!(std::fs::read(&dest).unwrap(), pattern(SIZE));
}

#[tokio::test]
async fn remote_addresses_are_checked() {
    assert!(
        open_remote("http://example.com", None, "/api/v1/big", &BTreeMap::new())
            .await
            .is_err()
    );
    assert!(
        open_remote("http://127.0.0.1:1", None, "/other", &BTreeMap::new())
            .await
            .is_err()
    );
}

#[test]
fn disposition_names() {
    assert_eq!(
        disposition_name("attachment; filename=\"a b.pdf\"").as_deref(),
        Some("a b.pdf")
    );
    assert_eq!(
        disposition_name("attachment; filename=\"x.pdf\"; filename*=UTF-8''%C3%A8.pdf").as_deref(),
        Some("è.pdf")
    );
    assert_eq!(disposition_name("attachment"), None);
}

#[test]
fn busy_is_told_apart_from_cancelled() {
    let busy = serde_json::to_value(DownloadOutcome::busy()).unwrap();
    assert_eq!(busy, serde_json::json!({ "saved": false, "busy": true }));
    let cancelled = serde_json::to_value(DownloadOutcome::cancelled()).unwrap();
    assert_eq!(cancelled, serde_json::json!({ "saved": false }));
    assert_ne!(DownloadOutcome::busy(), DownloadOutcome::cancelled());
}
