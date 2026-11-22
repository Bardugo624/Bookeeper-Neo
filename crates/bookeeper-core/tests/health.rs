use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn health_reports_ok_and_version() {
    let app = bookeeper_core::router(bookeeper_core::AppState {
        version: "2.0.0-dev",
    });
    let res = app
        .oneshot(Request::get("/api/v1/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], "2.0.0-dev");
    assert!(chrono::DateTime::parse_from_rfc3339(body["time"].as_str().unwrap()).is_ok());
}
