use axum::{
    body::Body,
    http::{Request, StatusCode},
    response::IntoResponse,
    routing::post,
    Router,
};
use bookeeper_core::{
    auth::{DeviceKind, Role},
    ApiError, ApiJson,
};
use http_body_util::BodyExt;
use serde::Deserialize;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Echo {
    name: String,
}

async fn echo(ApiJson(b): ApiJson<Echo>) -> String {
    b.name
}

async fn send(content_type: &str, body: &str) -> (StatusCode, String, serde_json::Value) {
    let app = Router::new().route("/echo", post(echo));
    let res = app
        .oneshot(
            Request::post("/echo")
                .header("content-type", content_type)
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    let ct = res
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap().to_string())
        .unwrap_or_default();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, ct, json)
}

#[tokio::test]
async fn malformed_json_is_bad_request() {
    let (s, ct, j) = send("application/json", "{").await;
    assert_eq!(s, 400);
    assert_eq!(j["error_code"], "bad_request");
    assert!(ct.starts_with("application/json"));
}

#[tokio::test]
async fn wrong_content_type_is_bad_request() {
    let (s, _, j) = send("text/plain", r#"{"name":"x"}"#).await;
    assert_eq!(s, 400);
    assert_eq!(j["error_code"], "bad_request");
}

#[tokio::test]
async fn missing_field_is_validation() {
    let (s, _, j) = send("application/json", "{}").await;
    assert_eq!(s, 422);
    assert_eq!(j["error_code"], "validation");
}

#[test]
fn too_many_requests_sets_retry_after() {
    let res = ApiError::too_many_requests(30).into_response();
    assert_eq!(res.status(), 429);
    assert_eq!(res.headers()["retry-after"], "30");
}

#[test]
fn role_ordering() {
    assert!(Role::Owner.at_least(Role::Admin));
    assert!(Role::Member.at_least(Role::Member));
    assert!(!Role::Guest.at_least(Role::Member));
    assert_eq!("admin".parse::<Role>().unwrap(), Role::Admin);
    assert!("boss".parse::<Role>().is_err());
}

#[test]
fn role_and_kind_serialize_lowercase() {
    assert_eq!(serde_json::to_string(&Role::Owner).unwrap(), "\"owner\"");
    assert_eq!(
        serde_json::to_string(&DeviceKind::Mobile).unwrap(),
        "\"mobile\""
    );
}

#[tokio::test]
async fn oversized_body_is_payload_too_large() {
    let big = format!(r#"{{"name":"{}"}}"#, "a".repeat(3 * 1024 * 1024));
    let (status, ct, body) = send("application/json", &big).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(ct, "application/json");
    assert_eq!(body["error_code"], "payload_too_large");
}
