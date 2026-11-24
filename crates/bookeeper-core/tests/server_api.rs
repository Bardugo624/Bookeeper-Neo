use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use bookeeper_core::{AppState, ServerInfo, TlsMode};
use http_body_util::BodyExt;
use tower::ServiceExt;

async fn get(state: AppState) -> (StatusCode, serde_json::Value) {
    let res = bookeeper_core::router(state)
        .oneshot(Request::get("/api/v1/server").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let body = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes())
        .unwrap_or(serde_json::Value::Null);
    (status, body)
}

fn with(tls: TlsMode, url: Option<&str>) -> AppState {
    AppState::for_tests().with_server(ServerInfo {
        tls,
        public_url: url.map(String::from),
    })
}

#[tokio::test]
async fn local_core_reports_local_and_no_phone() {
    let (st, b) = get(AppState::for_tests()).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(b["tls"], "local");
    assert!(b.as_object().unwrap().contains_key("public_url"));
    assert!(b["public_url"].is_null());
    assert_eq!(b["phone_ready"], false);
    assert_eq!(b["version"], bookeeper_core::VERSION);
}

#[tokio::test]
async fn acme_server_is_phone_ready() {
    let (_, b) = get(with(TlsMode::Acme, Some("https://libri.example.org"))).await;
    assert_eq!(b["tls"], "acme");
    assert_eq!(b["phone_ready"], true);
    assert_eq!(b["public_url"], "https://libri.example.org");
}

#[tokio::test]
async fn off_behind_an_https_proxy_is_phone_ready() {
    let (_, b) = get(with(TlsMode::Off, Some("https://libri.example.org"))).await;
    assert_eq!(b["tls"], "off");
    assert_eq!(b["phone_ready"], true);
}

#[tokio::test]
async fn self_signed_is_never_phone_ready() {
    let (_, b) = get(with(TlsMode::SelfSigned, Some("https://192.168.1.5:8443"))).await;
    assert_eq!(b["tls"], "self");
    assert_eq!(b["phone_ready"], false);
}

#[tokio::test]
async fn needs_no_token() {
    let (st, _) = get(AppState::for_tests()).await;
    assert_eq!(st, StatusCode::OK);
}

#[test]
fn is_in_the_openapi_document() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    assert!(doc["paths"]["/api/v1/server"].is_object());
    assert!(doc["components"]["schemas"]["ServerOut"].is_object());
    assert!(doc["components"]["schemas"]["TlsMode"].is_object());
}
