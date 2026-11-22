//! The mobile web app (`apps/mobile/dist`), embedded in the binary.

use axum::http::{header, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use bookeeper_core::ApiError;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../apps/mobile/dist"]
struct Assets;

fn file_response(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Some(
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, mime.essence_str().to_string())],
            file.data.into_owned(),
        )
            .into_response(),
    )
}

/// The only fallback of the server router: JSON 404 under `/api/`, otherwise the
/// requested embedded file or `index.html` (client-side routes of the SPA).
async fn fallback(method: Method, uri: Uri) -> Response {
    let path = uri.path();
    if path == "/api" || path.starts_with("/api/") {
        return ApiError::not_found().into_response();
    }
    if method != Method::GET && method != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let wanted = path.trim_start_matches('/');
    if wanted.is_empty() {
        return index();
    }
    if let Some(file) = file_response(wanted) {
        return file;
    }
    // A missing asset is a 404; only extension-less paths are client-side routes.
    let last = wanted.rsplit('/').next().unwrap_or(wanted);
    if last.contains('.') {
        return StatusCode::NOT_FOUND.into_response();
    }
    index()
}

fn index() -> Response {
    file_response("index.html").unwrap_or_else(|| StatusCode::NOT_FOUND.into_response())
}

/// Routes serving the embedded web app. Carries the router's single fallback.
pub fn web_routes() -> axum::Router {
    axum::Router::new().fallback(fallback)
}
