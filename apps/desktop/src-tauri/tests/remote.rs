use axum::Router;
use bookeeper_core::AppState;
use bookeeper_desktop_lib::connections::{Connection, ConnectionKind, Store};
use bookeeper_desktop_lib::remote::{is_local_address, probe, request, route, route_raw};
use bookeeper_net::tls::Identity;
use std::collections::BTreeMap;
use std::net::TcpListener;

fn core() -> Router {
    bookeeper_core::router(AppState::for_tests())
}

fn no_headers() -> BTreeMap<String, String> {
    BTreeMap::new()
}

/// Plain http server on a free loopback port.
async fn plain_server(app: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

/// TLS server with a fresh self-signed identity.
async fn tls_server(app: Router) -> (String, Identity, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let id =
        Identity::load_or_create(dir.path(), &["localhost".into(), "127.0.0.1".into()]).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let addr = listener.local_addr().unwrap();
    let cfg = axum_server::tls_rustls::RustlsConfig::from_config(id.server_config().unwrap());
    tokio::spawn(async move {
        axum_server::from_tcp_rustls(listener, cfg)
            .unwrap()
            .serve(app.into_make_service())
            .await
            .unwrap()
    });
    (format!("https://{addr}"), id, dir)
}

fn connection(url: &str, fingerprint: Option<String>) -> Connection {
    Connection {
        id: uuid::Uuid::now_v7().to_string(),
        kind: ConnectionKind::Remote,
        url: Some(url.into()),
        fingerprint,
        library_name: None,
        user_name: None,
        device_id: None,
        access_token: None,
        refresh_token: None,
    }
}

fn store() -> (tempfile::TempDir, Store) {
    let d = tempfile::tempdir().unwrap();
    let s = Store::new(d.path());
    (d, s)
}

#[test]
fn is_local_address_table() {
    for h in [
        "127.0.0.1",
        "localhost",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.10",
        "169.254.1.1",
        "[::1]",
        "fd00::1",
        "fe80::1",
        "nas.local",
    ] {
        assert!(is_local_address(h), "{h} should be local");
    }
    for h in [
        "172.32.0.1",
        "8.8.8.8",
        "example.org",
        "local",
        "nas.local.example.org",
        "2001:db8::1",
    ] {
        assert!(!is_local_address(h), "{h} should not be local");
    }
}

#[tokio::test]
async fn plain_http_to_a_public_address_is_refused() {
    let started = std::time::Instant::now();
    let r = request(
        "http://203.0.113.7:9",
        None,
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 400);
    assert!(r.body.contains("insecure_address"), "{}", r.body);
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
    let p = probe("http://203.0.113.7:9").await;
    assert_eq!(p.error.as_deref(), Some("insecure_address"));
    assert!(!p.reachable);
}

#[tokio::test]
async fn a_remote_connection_reaches_the_server() {
    let url = plain_server(core()).await;
    let direct = request(&url, None, "GET", "/api/v1/health", None, no_headers()).await;
    assert_eq!(direct.status, 200);
    let local =
        bookeeper_desktop_lib::dispatch(core(), "GET", "/api/v1/health", None, no_headers()).await;
    assert_eq!(direct.body, local.body);
    let raw = route_raw(
        &store().1,
        core(),
        None,
        "GET",
        "/api/v1/health",
        None,
        None,
        no_headers(),
    )
    .await;
    assert_eq!(raw.status, 200);
}

#[tokio::test]
async fn headers_and_bodies_pass_through() {
    let url = plain_server(core()).await;
    let body = serde_json::json!({
        "library_name": "Casa", "display_name": "Ada", "email": null,
        "password": "correct horse battery", "setup_code": null,
        "device_name": "test", "device_kind": "desktop"
    })
    .to_string();
    let r = request(
        &url,
        None,
        "POST",
        "/api/v1/setup",
        Some(body),
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 201, "{}", r.body);
    let v: serde_json::Value = serde_json::from_str(&r.body).unwrap();
    let token = v["session"]["access_token"].as_str().unwrap();
    let headers = BTreeMap::from([("Authorization".to_owned(), format!("Bearer {token}"))]);
    let me = request(&url, None, "GET", "/api/v1/me", None, headers).await;
    assert_eq!(me.status, 200, "{}", me.body);
    let anon = request(&url, None, "GET", "/api/v1/me", None, no_headers()).await;
    assert_eq!(anon.status, 401);
}

#[tokio::test]
async fn paths_cannot_leave_the_api() {
    let url = plain_server(core()).await;
    for p in ["/etc/passwd", "/api/../etc/passwd", "/api/v1/he alth"] {
        let r = request(&url, None, "GET", p, None, no_headers()).await;
        assert_eq!(r.status, 400, "{p}");
    }
}

#[tokio::test]
async fn a_pinned_fingerprint_is_accepted() {
    let (url, id, _d) = tls_server(core()).await;
    let r = request(
        &url,
        Some(&id.fingerprint_hex()),
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 200, "{}", r.body);
}

#[tokio::test]
async fn a_different_fingerprint_is_refused() {
    let (url, _id, _d) = tls_server(core()).await;
    let other = "00:".repeat(31) + "00";
    let r = request(
        &url,
        Some(&other),
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 0);
    assert!(r.body.contains("network"), "{}", r.body);
}

#[tokio::test]
async fn a_self_signed_server_without_a_pin_is_refused() {
    let (url, _id, _d) = tls_server(core()).await;
    let r = request(&url, None, "GET", "/api/v1/health", None, no_headers()).await;
    assert_eq!(r.status, 0);
    assert!(r.body.contains("network"));
}

#[tokio::test]
async fn probe_reports_an_untrusted_certificate() {
    let (url, id, _d) = tls_server(core()).await;
    let p = probe(&url).await;
    assert!(p.reachable);
    assert!(!p.trusted);
    assert_eq!(
        p.fingerprint.as_deref(),
        Some(id.fingerprint_hex().as_str())
    );
    assert_eq!(
        p.phrase.as_deref(),
        Some(bookeeper_net::phrase::verification_phrase(&id.fingerprint).as_str())
    );
    assert!(p.server.is_some());
    assert!(p.setup.is_some());
    assert!(p.error.is_none());
    // A bare host:port gets https:// and a trailing slash is dropped.
    let bare = format!("{}/", url.trim_start_matches("https://"));
    assert_eq!(probe(&bare).await.fingerprint, p.fingerprint);
}

#[tokio::test]
async fn probe_of_a_plain_local_server_is_trusted() {
    let url = plain_server(core()).await;
    let p = probe(&url).await;
    assert!(p.reachable && p.trusted);
    assert!(p.fingerprint.is_none() && p.phrase.is_none());
    assert!(p.server.is_some() && p.setup.is_some());
    assert!(p.error.is_none());
}

#[tokio::test]
async fn probe_of_something_else_is_not_bookeeper() {
    let app = Router::new()
        .fallback(|| async { ([("content-type", "text/html")], "<html>hello</html>") });
    let url = plain_server(app).await;
    let p = probe(&url).await;
    assert!(p.reachable);
    assert_eq!(p.error.as_deref(), Some("not_bookeeper"));
    assert!(p.server.is_none());
}

#[tokio::test]
async fn probe_of_a_dead_port_is_unreachable() {
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p = probe(&format!("http://127.0.0.1:{port}")).await;
    assert!(!p.reachable);
    assert_eq!(p.error.as_deref(), Some("network"));
}

#[tokio::test]
async fn an_unknown_connection_id_is_a_bad_request() {
    let (_d, s) = store();
    let r = route(
        &s,
        core(),
        Some("nope"),
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 400);
    assert!(r.body.contains("bad_request"));
}

#[tokio::test]
async fn without_a_connection_the_core_answers() {
    let (_d, s) = store();
    let r = route(
        &s,
        core(),
        None,
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 200);
    // A local connection also goes to the core.
    let local = Connection {
        kind: ConnectionKind::Local,
        url: None,
        ..connection("", None)
    };
    s.upsert(local.clone()).unwrap();
    s.activate(&local.id).unwrap();
    let r = route(
        &s,
        core(),
        None,
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.status, 200);
}

#[tokio::test]
async fn the_active_remote_connection_is_used() {
    let url = plain_server(
        Router::new().route("/api/v1/health", axum::routing::get(|| async { "remote" })),
    )
    .await;
    let (_d, s) = store();
    let c = connection(&url, None);
    s.upsert(c.clone()).unwrap();
    s.activate(&c.id).unwrap();
    let r = route(
        &s,
        core(),
        None,
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(r.body, "remote");
    let by_id = route(
        &s,
        core(),
        Some(&c.id),
        "GET",
        "/api/v1/health",
        None,
        no_headers(),
    )
    .await;
    assert_eq!(by_id.body, "remote");
}

#[tokio::test]
#[ignore = "needs multicast on the network"]
async fn discover_returns_a_list() {
    let list = bookeeper_desktop_lib::discover::discover().await;
    let _ = list.len();
}
