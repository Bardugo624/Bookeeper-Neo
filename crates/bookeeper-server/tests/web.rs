//! The reader engine page may be framed by the same site; every other page may not.
//! Exercises the response builder directly, so it does not depend on the mobile build.

#![allow(dead_code)]

#[path = "../src/layers.rs"]
mod layers;
#[path = "../src/web.rs"]
mod web;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::get;
use axum::Router;
use bookeeper_core::{ServerInfo, TlsMode};
use tower::ServiceExt;

fn info() -> ServerInfo {
    ServerInfo {
        tls: TlsMode::Off,
        public_url: None,
    }
}

async fn frame_option(name: &'static str) -> String {
    let router = Router::new().route(
        "/page",
        get(move || async move { web::response_for(name, b"<html></html>".to_vec()) }),
    );
    let res = layers::apply(router, &info())
        .oneshot(Request::get("/page").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    res.headers()["x-frame-options"]
        .to_str()
        .unwrap()
        .to_string()
}

#[tokio::test]
async fn the_reader_frame_can_be_framed_by_the_same_site() {
    assert_eq!(frame_option("reader-frame.html").await, "SAMEORIGIN");
}

#[tokio::test]
async fn other_pages_still_refuse_frames() {
    assert_eq!(frame_option("index.html").await, "DENY");
}
