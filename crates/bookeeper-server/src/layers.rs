//! Layers shared by every route, applied once after the core and web routers are merged.

use axum::extract::Request;
use axum::http::{header, HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::Router;
use bookeeper_core::{ServerInfo, TlsMode};
use std::time::Duration;
use tower_http::trace::TraceLayer;
use tracing::{error, info, info_span, Span};

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
        .on_failure(())
        .on_response(|res: &Response, latency: Duration, _span: &Span| {
            let status = res.status().as_u16();
            let latency_ms = latency.as_millis();
            if res.status().is_server_error() {
                error!(status, latency_ms, "response");
            } else {
                info!(status, latency_ms, "response");
            }
        });
    router
        .layer(middleware::from_fn(move |req, next| {
            headers(hsts, req, next)
        }))
        .layer(trace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::routing::get;
    use std::sync::{Arc, Mutex};
    use tower::ServiceExt;

    #[derive(Clone, Default)]
    struct Buf(Arc<Mutex<Vec<u8>>>);

    impl std::io::Write for Buf {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Buf {
        type Writer = Buf;
        fn make_writer(&'a self) -> Buf {
            self.clone()
        }
    }

    fn logged(path: &str) -> String {
        let buf = Buf::default();
        let sub = tracing_subscriber::fmt()
            .with_writer(buf.clone())
            .with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .finish();
        let _guard = tracing::subscriber::set_default(sub);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let app = apply(
            Router::new()
                .route("/boom", get(|| async { StatusCode::INTERNAL_SERVER_ERROR }))
                .route("/fine", get(|| async { "ok" })),
            &ServerInfo::local(),
        );
        rt.block_on(async {
            app.oneshot(Request::get(path).body(axum::body::Body::empty()).unwrap())
                .await
                .unwrap();
        });
        let bytes = buf.0.lock().unwrap().clone();
        String::from_utf8(bytes).unwrap()
    }

    #[test]
    fn a_500_is_logged_once_at_error() {
        let out = logged("/boom");
        let lines: Vec<_> = out.lines().filter(|l| l.contains("/boom")).collect();
        assert_eq!(lines.len(), 1, "{out}");
        assert!(
            lines[0].contains("ERROR") && lines[0].contains("500"),
            "{out}"
        );
    }

    #[test]
    fn a_200_is_logged_once_at_info() {
        let out = logged("/fine");
        let lines: Vec<_> = out.lines().filter(|l| l.contains("/fine")).collect();
        assert_eq!(lines.len(), 1, "{out}");
        assert!(
            lines[0].contains("INFO") && lines[0].contains("200"),
            "{out}"
        );
    }
}
