//! The mobile web app (`apps/mobile/dist`), embedded in the binary.

use axum::http::{header, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use bookeeper_core::ApiError;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../apps/mobile/dist"]
struct Assets;

/// The one page that may be framed, and only by the same site: the reader engine
/// page, which the app embeds in an `<iframe>`. Every other file keeps `DENY`
/// (set by `layers::apply` where missing).
const FRAMEABLE: &str = "reader-frame.html";

fn file_response(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    Some(response_for(path, file.data.into_owned()))
}

/// Builds the response of the embedded file `path` with content `data`.
pub(crate) fn response_for(path: &str, data: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let content_type = if mime.type_() == "text" || mime.subtype() == "javascript" {
        format!("{}; charset=utf-8", mime.essence_str())
    } else {
        mime.essence_str().to_string()
    };
    let mut res = (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_string()),
        ],
        data,
    )
        .into_response();
    if path == FRAMEABLE {
        res.headers_mut().insert(
            header::X_FRAME_OPTIONS,
            header::HeaderValue::from_static("SAMEORIGIN"),
        );
    }
    res
}

/// The only fallback of the server router: JSON 404 under `/api/`, otherwise the
/// requested embedded file or `index.html` (client-side routes of the SPA).
async fn fallback(method: Method, uri: Uri) -> Response {
    let path = uri.path();
    if path == "/api" || path.starts_with("/api/") {
        return ApiError::not_found().into_response();
    }
    if method != Method::GET && method != Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }
    let wanted = path.trim_start_matches('/');
    if wanted.is_empty() {
        return index();
    }
    if let Some(file) = file_response(wanted) {
        return file;
    }
    // A missing asset is a 404; only extension-less paths are client-side routes.
    // Client routes must therefore keep dotted values (hosts, emails) in the query string.
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
