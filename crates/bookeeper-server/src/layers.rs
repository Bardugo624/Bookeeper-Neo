//! Layers shared by every route, applied once after the core and web routers are merged.

use axum::extract::Request;
use axum::http::{header, HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::Router;
use bookeeper_core::{ServerInfo, TlsMode};
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::{info_span, Level};

/// Whether responses should carry `Strict-Transport-Security`.
fn wants_hsts(info: &ServerInfo) -> bool {
    match info.tls {
        TlsMode::Acme => true,
        TlsMode::Off => info
            .public_url
            .as_deref()
            .is_some_and(|u| u.starts_with("https://")),
        TlsMode::SelfSigned | TlsMode::Local => false,
    }
}

fn set_if_missing(res: &mut Response, name: HeaderName, value: &'static str) {
    res.headers_mut()
        .entry(name)
        .or_insert(HeaderValue::from_static(value));
}

async fn headers(hsts: bool, req: Request, next: Next) -> Response {
    let is_api = req.uri().path().starts_with("/api/");
    let mut res = next.run(req).await;
    set_if_missing(&mut res, header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    set_if_missing(&mut res, header::REFERRER_POLICY, "no-referrer");
    set_if_missing(&mut res, header::X_FRAME_OPTIONS, "DENY");
    if is_api
        && !res.headers().contains_key(header::CACHE_CONTROL)
        && !res.headers().contains_key(header::ETAG)
    {
        set_if_missing(&mut res, header::CACHE_CONTROL, "no-store");
    }
    if hsts {
        set_if_missing(
            &mut res,
            header::STRICT_TRANSPORT_SECURITY,
            "max-age=31536000",
        );
    }
    res
}

/// Adds security headers, cache policy for `/api/` and request tracing to `router`.
pub fn apply(router: Router, info: &ServerInfo) -> Router {
    let hsts = wants_hsts(info);
    // The span records the method and the path only: the query string may carry codes,
    // and headers and bodies are never logged.
    let trace = TraceLayer::new_for_http()
        .make_span_with(
            |req: &Request| info_span!("request", method = %req.method(), path = %req.uri().path()),
        )
        .on_response(DefaultOnResponse::new().level(Level::INFO));
    router
        .layer(middleware::from_fn(move |req, next| {
            headers(hsts, req, next)
        }))
        .layer(trace)
}
