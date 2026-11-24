mod common;

use axum::body::Body;
use axum::response::IntoResponse;
use bookeeper_core::api::util::{download, read_body};
use common::*;
use http_body_util::BodyExt;

#[tokio::test]
async fn download_sets_type_and_disposition() {
    let resp = download(b"hello".to_vec(), "application/zip", "backup.zip");
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.headers()["content-type"], "application/zip");
    assert_eq!(
        resp.headers()["content-disposition"],
        "attachment; filename=\"backup.zip\""
    );
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..], b"hello");
}

#[tokio::test]
async fn download_sanitises_the_filename() {
    let resp = download(vec![], "application/zip", "Casa mia/../x\".zip");
    let h = resp.headers()["content-disposition"].to_str().unwrap();
    let name = h
        .strip_prefix("attachment; filename=\"")
        .and_then(|r| r.strip_suffix('"'))
        .expect("shape");
    for bad in ['/', '"', '\\', ' '] {
        assert!(!name.contains(bad), "{name}");
    }
    assert_eq!(name, "Casa_mia_.._x_.zip");
}

#[tokio::test]
async fn read_body_accepts_up_to_the_limit() {
    let got = read_body(Body::from(vec![7u8; 16]), 16).await.ok().unwrap();
    assert_eq!(got.len(), 16);
}

#[tokio::test]
async fn read_body_rejects_larger_bodies() {
    let Err(err) = read_body(Body::from(vec![7u8; 17]), 16).await else {
        panic!("expected an error");
    };
    let resp = err.into_response();
    assert_eq!(resp.status(), 413);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["error_code"], "payload_too_large");
}

#[test]
fn openapi_still_builds_and_keeps_existing_paths() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    assert!(doc["paths"]["/api/v1/books"].is_object());
    assert!(doc["paths"]["/api/v1/health"].is_object());
}

#[tokio::test]
async fn existing_routes_still_answer() {
    let state = bookeeper_core::AppState::for_tests();
    let (status, _, _) = call(&state, "GET", "/api/v1/health", None, None).await;
    assert_eq!(status, 200);
}
