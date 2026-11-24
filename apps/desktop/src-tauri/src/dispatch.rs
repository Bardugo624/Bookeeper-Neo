use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use http_body_util::BodyExt;
use serde::Serialize;
use std::collections::BTreeMap;
use tower::ServiceExt;

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

fn error(status: StatusCode, code: &str, message: &str) -> ApiResponse {
    ApiResponse {
        status: status.as_u16(),
        body: serde_json::json!({ "error_code": code, "message": message }).to_string(),
    }
}

fn bad_request(message: &str) -> ApiResponse {
    error(StatusCode::BAD_REQUEST, "bad_request", message)
}

/// The only methods the `Transport` contract can send.
const ALLOWED_METHODS: [Method; 5] = [
    Method::GET,
    Method::POST,
    Method::PATCH,
    Method::PUT,
    Method::DELETE,
];

/// Calls the core router in-process, without opening a socket.
pub async fn dispatch(
    router: Router,
    method: &str,
    path: &str,
    body: Option<String>,
) -> ApiResponse {
    let method = match Method::from_bytes(method.as_bytes()) {
        Ok(m) if ALLOWED_METHODS.contains(&m) => m,
        _ => return bad_request("Invalid HTTP method"),
    };
    if !path.starts_with("/api/") {
        return bad_request("Path must start with /api/");
    }
    let mut builder = Request::builder().method(method).uri(path);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let Ok(request) = builder.body(Body::from(body.unwrap_or_default())) else {
        return bad_request("Invalid request");
    };
    let response = match router.oneshot(request).await {
        Ok(r) => r,
        Err(never) => match never {},
    };
    let status = response.status().as_u16();
    match response.into_body().collect().await {
        Ok(collected) => ApiResponse {
            status,
            body: String::from_utf8_lossy(&collected.to_bytes()).into_owned(),
        },
        Err(_) => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Internal server error",
        ),
    }
}

#[derive(Debug, Serialize)]
pub struct RawApiResponse {
    pub status: u16,
    pub body_base64: String,
    pub content_type: Option<String>,
    pub headers: BTreeMap<String, String>,
}

/// Request headers the webview may set; everything else is dropped.
const ALLOWED_REQUEST_HEADERS: [&str; 2] = ["if-none-match", "x-confirm-token"];
/// Response headers handed back to the webview.
const EXPOSED_RESPONSE_HEADERS: [&str; 5] = [
    "etag",
    "content-disposition",
    "x-labels-skipped",
    "retry-after",
    "cache-control",
];

fn raw_error(status: StatusCode, code: &str, message: &str) -> RawApiResponse {
    let body = serde_json::json!({ "error_code": code, "message": message }).to_string();
    RawApiResponse {
        status: status.as_u16(),
        body_base64: STANDARD.encode(body),
        content_type: Some("application/json".to_owned()),
        headers: BTreeMap::new(),
    }
}

fn raw_bad_request(message: &str) -> RawApiResponse {
    raw_error(StatusCode::BAD_REQUEST, "bad_request", message)
}

/// Like [`dispatch`], but moves bytes (base64 over IPC) and a few headers.
pub async fn dispatch_raw(
    router: Router,
    method: &str,
    path: &str,
    body_base64: Option<String>,
    content_type: Option<String>,
    headers: BTreeMap<String, String>,
) -> RawApiResponse {
    let method = match Method::from_bytes(method.as_bytes()) {
        Ok(m) if ALLOWED_METHODS.contains(&m) => m,
        _ => return raw_bad_request("Invalid HTTP method"),
    };
    if !path.starts_with("/api/") {
        return raw_bad_request("Path must start with /api/");
    }
    let body = match body_base64 {
        Some(b) => match STANDARD.decode(b) {
            Ok(bytes) => Some(bytes),
            Err(_) => return raw_bad_request("Invalid base64 body"),
        },
        None => None,
    };
    let mut builder = Request::builder().method(method).uri(path);
    if body.is_some() {
        if let Some(ct) = content_type.as_deref().filter(|c| !c.is_empty()) {
            builder = builder.header("content-type", ct);
        }
    }
    for (name, value) in &headers {
        let lower = name.to_ascii_lowercase();
        if ALLOWED_REQUEST_HEADERS.contains(&lower.as_str()) {
            builder = builder.header(lower, value.as_str());
        }
    }
    let Ok(request) = builder.body(Body::from(body.unwrap_or_default())) else {
        return raw_bad_request("Invalid request");
    };
    let response = match router.oneshot(request).await {
        Ok(r) => r,
        Err(never) => match never {},
    };
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let mut out_headers = BTreeMap::new();
    for name in EXPOSED_RESPONSE_HEADERS {
        if let Some(v) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
            out_headers.insert(name.to_owned(), v.to_owned());
        }
    }
    match response.into_body().collect().await {
        Ok(collected) => RawApiResponse {
            status,
            body_base64: STANDARD.encode(collected.to_bytes()),
            content_type,
            headers: out_headers,
        },
        Err(_) => raw_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Internal server error",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bookeeper_core::AppState;

    fn test_router() -> Router {
        bookeeper_core::router(AppState::for_tests())
    }

    #[tokio::test]
    async fn dispatches_to_core_without_a_socket() {
        let r = dispatch(test_router(), "GET", "/api/v1/health", None).await;
        assert_eq!(r.status, 200);
        assert!(r.body.contains("\"status\":\"ok\""));
    }

    #[tokio::test]
    async fn rejects_paths_outside_api() {
        let r = dispatch(test_router(), "GET", "/etc/passwd", None).await;
        assert_eq!(r.status, 400);
        assert!(r.body.contains("\"error_code\":\"bad_request\""));
    }

    #[tokio::test]
    async fn rejects_invalid_method_without_panicking() {
        let r = dispatch(test_router(), "NOT A METHOD", "/api/v1/health", None).await;
        assert_eq!(r.status, 400);
    }

    #[tokio::test]
    async fn passes_core_errors_through() {
        let r = dispatch(test_router(), "GET", "/api/v1/nope", None).await;
        assert_eq!(r.status, 404);
        assert!(r.body.contains("not_found"));
    }

    #[tokio::test]
    async fn rejects_methods_outside_the_transport_contract() {
        for method in ["TRACE", "CONNECT", "get", "FOO"] {
            let r = dispatch(test_router(), method, "/api/v1/health", None).await;
            assert_eq!(r.status, 400, "{method}");
        }
    }

    #[tokio::test]
    async fn rejects_malformed_paths_without_panicking() {
        for path in ["/api/v1/he alth", "/api/\u{0}"] {
            let r = dispatch(test_router(), "GET", path, None).await;
            assert_eq!(r.status, 400, "{path:?}");
            assert!(r.body.contains("bad_request"));
        }
    }

    #[tokio::test]
    async fn non_ascii_paths_reach_the_core() {
        let r = dispatch(test_router(), "GET", "/api/v1/libreria/città", None).await;
        assert_eq!(r.status, 404);
        assert!(r.body.contains("not_found"));
    }

    #[tokio::test]
    async fn dot_segments_never_leave_the_api() {
        let r = dispatch(test_router(), "GET", "/api/../etc/passwd", None).await;
        assert_eq!(r.status, 404);
        assert!(r.body.contains("not_found"));
    }

    fn decode(r: &RawApiResponse) -> Vec<u8> {
        STANDARD.decode(&r.body_base64).unwrap()
    }

    fn probe_router() -> Router {
        use axum::{
            http::{header, HeaderMap},
            routing::{get, post},
        };
        Router::new()
            .route(
                "/api/echo-headers",
                get(|h: HeaderMap| async move {
                    let mut names: Vec<String> = h.keys().map(|k| k.as_str().to_owned()).collect();
                    names.sort();
                    names.join(",")
                }),
            )
            .route(
                "/api/resp-headers",
                get(|| async {
                    (
                        [
                            (header::ETAG, "\"abc\""),
                            (
                                header::CONTENT_DISPOSITION,
                                "attachment; filename=\"a.pdf\"",
                            ),
                            (header::SET_COOKIE, "s=1"),
                        ],
                        "ok",
                    )
                }),
            )
            .route("/api/echo", post(|b: axum::body::Bytes| async move { b }))
    }

    #[tokio::test]
    async fn raw_get_returns_bytes_and_content_type() {
        let r = dispatch_raw(
            test_router(),
            "GET",
            "/api/v1/health",
            None,
            None,
            BTreeMap::new(),
        )
        .await;
        assert_eq!(r.status, 200);
        assert_eq!(r.content_type.as_deref(), Some("application/json"));
        assert!(String::from_utf8(decode(&r))
            .unwrap()
            .contains("\"status\":\"ok\""));
    }

    #[tokio::test]
    async fn raw_rejects_paths_outside_api_and_bad_methods() {
        for (m, p) in [
            ("GET", "/etc/passwd"),
            ("TRACE", "/api/v1/health"),
            ("get", "/api/v1/health"),
        ] {
            let r = dispatch_raw(test_router(), m, p, None, None, BTreeMap::new()).await;
            assert_eq!(r.status, 400, "{m} {p}");
            assert!(String::from_utf8(decode(&r))
                .unwrap()
                .contains("\"error_code\":\"bad_request\""));
        }
    }

    #[tokio::test]
    async fn raw_rejects_invalid_base64() {
        let r = dispatch_raw(
            test_router(),
            "POST",
            "/api/v1/health",
            Some("!!not base64!!".into()),
            None,
            BTreeMap::new(),
        )
        .await;
        assert_eq!(r.status, 400);
        assert!(String::from_utf8(decode(&r))
            .unwrap()
            .contains("bad_request"));
    }

    #[tokio::test]
    async fn raw_forwards_only_allowed_headers() {
        let headers = BTreeMap::from([
            ("X-Confirm-Token".to_owned(), "t".to_owned()),
            ("If-None-Match".to_owned(), "\"e\"".to_owned()),
            ("Authorization".to_owned(), "Bearer x".to_owned()),
            ("Host".to_owned(), "evil".to_owned()),
        ]);
        let r = dispatch_raw(
            probe_router(),
            "GET",
            "/api/echo-headers",
            None,
            None,
            headers,
        )
        .await;
        assert_eq!(r.status, 200);
        assert_eq!(
            String::from_utf8(decode(&r)).unwrap(),
            "if-none-match,x-confirm-token"
        );
    }

    #[tokio::test]
    async fn raw_returns_selected_response_headers() {
        let r = dispatch_raw(
            probe_router(),
            "GET",
            "/api/resp-headers",
            None,
            None,
            BTreeMap::new(),
        )
        .await;
        assert_eq!(r.headers.get("etag").map(String::as_str), Some("\"abc\""));
        assert!(r.headers.contains_key("content-disposition"));
        assert!(!r.headers.contains_key("set-cookie"));
    }

    #[tokio::test]
    async fn raw_round_trips_binary_bodies() {
        let bytes: Vec<u8> = (0..=255).collect();
        let r = dispatch_raw(
            probe_router(),
            "POST",
            "/api/echo",
            Some(STANDARD.encode(&bytes)),
            Some("application/octet-stream".into()),
            BTreeMap::new(),
        )
        .await;
        assert_eq!(r.status, 200);
        assert_eq!(decode(&r), bytes);
    }
}
