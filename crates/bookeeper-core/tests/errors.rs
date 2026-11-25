use axum::{
    body::Body,
    http::{header::HeaderMap, Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

async fn call(method: &str, path: &str) -> (StatusCode, HeaderMap, serde_json::Value) {
    let app = bookeeper_core::router(bookeeper_core::AppState::for_tests());
    let res = app
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let body = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, headers, body)
}

#[tokio::test]
async fn unknown_api_route_is_json_not_found() {
    let (status, headers, body) = call("GET", "/api/v1/does-not-exist").await;
    assert_eq!(status, 404);
    assert_eq!(headers["content-type"], "application/json");
    assert_eq!(body["error_code"], "not_found");
    assert!(body["message"].is_string());
}

#[tokio::test]
async fn wrong_method_is_json_error() {
    let (status, _, body) = call("DELETE", "/api/v1/health").await;
    assert_eq!(status, 405);
    assert_eq!(body["error_code"], "method_not_allowed");
}

#[test]
fn db_errors_do_not_leak_details() {
    let e: bookeeper_core::ApiError =
        bookeeper_core::DbError::Migration("secret path".into()).into();
    assert_eq!(e.code, "internal");
    assert!(!e.message.contains("secret"));
}
