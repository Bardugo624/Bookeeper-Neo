use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use serde::Serialize;
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
}
