use std::net::{IpAddr, Ipv4Addr};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::Request;
use bookeeper_core::AppState;
use bookeeper_desktop_lib::sharing::{Sharing, SharingStatus};
use bookeeper_net::tls::Identity;
use serde_json::{json, Value};
use tower::ServiceExt;

const LOCAL: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);

/// A library whose owner has (or lacks) a password, created in process.
async fn state(with_password: bool) -> (AppState, String) {
    let state = AppState::for_tests();
    let mut body = json!({
        "library_name": "Casa", "display_name": "Ada",
        "device_name": "Desktop", "device_kind": "desktop",
    });
    if with_password {
        body["email"] = json!("ada@example.org");
        body["password"] = json!("correct horse battery");
    }
    let (status, out) = local(&state, "POST", "/api/v1/setup", None, Some(body)).await;
    assert_eq!(status, 201, "{out}");
    let token = out["session"]["access_token"].as_str().unwrap().to_string();
    (state, token)
}

/// A request to the in-process router (no network).
async fn local(
    state: &AppState,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (u16, Value) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let body = match body {
        Some(b) => {
            req = req.header("content-type", "application/json");
            Body::from(b.to_string())
        }
        None => Body::empty(),
    };
    let res = bookeeper_core::router(state.clone())
        .oneshot(req.body(body).unwrap())
        .await
        .unwrap();
    let status = res.status().as_u16();
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn sharing(dir: &std::path::Path, state: &AppState) -> Sharing {
    Sharing::with_options(dir, state.clone(), LOCAL, false)
}

fn fingerprint_of(status: &SharingStatus) -> [u8; 32] {
    let hex: String = status
        .fingerprint
        .as_ref()
        .unwrap()
        .split(':')
        .collect::<Vec<_>>()
        .concat();
    hex::decode(hex).unwrap().try_into().unwrap()
}

fn client(status: &SharingStatus) -> reqwest::Client {
    bookeeper_net::install_crypto_provider();
    reqwest::Client::builder()
        .use_preconfigured_tls(
            bookeeper_net::tls::pinned_client_config(fingerprint_of(status))
                .as_ref()
                .clone(),
        )
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap()
}

fn url(status: &SharingStatus, path: &str) -> String {
    format!("https://127.0.0.1:{}{path}", status.port)
}

async fn json_of(res: reqwest::Response) -> (u16, Value) {
    let status = res.status().as_u16();
    let bytes = res.bytes().await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn port_is_open(port: u16) -> bool {
    tokio::net::TcpStream::connect((LOCAL, port)).await.is_ok()
}

#[tokio::test]
async fn sharing_serves_the_core_over_pinned_tls() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    assert!(st.running && st.error.is_none(), "{st:?}");
    let res = client(&st)
        .get(url(&st, "/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    assert_eq!(res.headers()["x-content-type-options"], "nosniff");
    assert_eq!(res.headers()["cache-control"], "no-store");
    s.shutdown().await;
}

#[tokio::test]
async fn status_reports_fingerprint_and_phrase() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    let id = Identity::load(&dir.path().join("tls").join("self"))
        .unwrap()
        .unwrap();
    assert_eq!(st.fingerprint.as_deref(), Some(id.fingerprint_hex().as_str()));
    let phrase = st.phrase.clone().unwrap();
    assert_eq!(
        phrase,
        bookeeper_net::phrase::verification_phrase(&id.fingerprint)
    );
    assert_eq!(phrase.split_whitespace().count(), 6);
    s.shutdown().await;
}

#[tokio::test]
async fn plain_http_is_refused() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    let mut tcp = tokio::net::TcpStream::connect((LOCAL, st.port)).await.unwrap();
    let _ = tcp
        .write_all(b"GET /api/v1/health HTTP/1.1\r\nHost: x\r\n\r\n")
        .await;
    let mut got = Vec::new();
    let _ = tokio::time::timeout(Duration::from_secs(5), tcp.read_to_end(&mut got)).await;
    assert!(
        !String::from_utf8_lossy(&got).contains("200 OK"),
        "plain http was served"
    );
    s.shutdown().await;
}

#[tokio::test]
async fn without_a_password_sharing_does_not_start() {
    let (state, _) = state(false).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    assert!(!st.running && !st.enabled);
    assert_eq!(st.error.as_deref(), Some("password_required"));
    // Nothing was created: no identity, no listener.
    assert!(!dir.path().join("tls").exists());
}

#[tokio::test]
async fn a_busy_port_is_reported() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let busy = std::net::TcpListener::bind((LOCAL, 0)).unwrap();
    let port = busy.local_addr().unwrap().port();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(port)).await;
    assert!(!st.running);
    assert_eq!(st.error.as_deref(), Some("port_in_use"));
}

#[tokio::test]
async fn stopping_closes_the_port() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    assert!(port_is_open(st.port).await);
    let t = Instant::now();
    let off = s.set(false, None).await;
    assert!(t.elapsed() < Duration::from_secs(11), "{:?}", t.elapsed());
    assert!(!off.running && !off.enabled);
    assert!(!port_is_open(st.port).await);
}

#[tokio::test]
async fn the_preference_survives_a_restart() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    s.set(true, Some(0)).await;
    s.shutdown().await;
    assert!(dir.path().join("sharing.json").exists());
    let again = sharing(dir.path(), &state);
    let st = again.status().await;
    assert!(st.enabled && !st.running);
}

#[tokio::test]
async fn sharing_restarts_when_enabled() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    s.set(true, Some(0)).await;
    s.shutdown().await;
    let again = sharing(dir.path(), &state);
    let st = again.restore().await;
    assert!(st.running && st.error.is_none(), "{st:?}");
    let res = client(&st).get(url(&st, "/api/v1/health")).send().await.unwrap();
    assert_eq!(res.status(), 200);
    again.shutdown().await;

    // A disabled preference stays off.
    let off = sharing(dir.path(), &state);
    off.set(false, None).await;
    assert!(!sharing(dir.path(), &state).restore().await.running);
}

#[tokio::test]
async fn network_requests_cannot_create_a_library() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    let body = json!({
        "library_name": "Intruso", "display_name": "Eve", "email": "eve@example.org",
        "password": "correct horse battery", "setup_code": "AAAA-BBBB-CCCC",
        "device_name": "x", "device_kind": "mobile",
    });
    let res = client(&st)
        .post(url(&st, "/api/v1/setup"))
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .unwrap();
    let (code, _) = json_of(res).await;
    assert!(code == 403 || code == 409, "{code}");
    let count = state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get::<_, i64>(0)))
        .await
        .unwrap();
    assert_eq!(count, 1);
    s.shutdown().await;
}

#[tokio::test]
async fn server_info_over_the_network_says_self() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    let res = client(&st).get(url(&st, "/api/v1/server")).send().await.unwrap();
    let (code, info) = json_of(res).await;
    assert_eq!(code, 200);
    assert_eq!(info["tls"], "self");
    assert_eq!(info["phone_ready"], false);
    assert_eq!(info["public_url"], Value::Null);
    // The app's own view is unchanged.
    let (code, info) = local(&state, "GET", "/api/v1/server", None, None).await;
    assert_eq!(code, 200);
    assert_eq!(info["tls"], "local");
    s.shutdown().await;
}

#[tokio::test]
async fn pairing_works_over_the_network() {
    let (state, token) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let st = s.set(true, Some(0)).await;
    let (code, made) = local(&state, "POST", "/api/v1/pairing/codes", Some(&token), None).await;
    assert_eq!(code, 201, "{made}");
    let c = client(&st);
    let res = c
        .post(url(&st, "/api/v1/pairing/redeem"))
        .header("content-type", "application/json")
        .body(json!({"code": made["code"], "device_name": "Telefono", "device_kind": "mobile"}).to_string())
        .send()
        .await
        .unwrap();
    let (code, paired) = json_of(res).await;
    assert_eq!(code, 200, "{paired}");
    let access = paired["session"]["access_token"].as_str().unwrap();
    let res = c
        .get(url(&st, "/api/v1/me"))
        .bearer_auth(access)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    s.shutdown().await;
}

#[tokio::test]
async fn identity_is_stable_across_restarts() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = sharing(dir.path(), &state);
    let first = s.set(true, Some(0)).await;
    s.shutdown().await;
    let second = sharing(dir.path(), &state).set(true, Some(0)).await;
    assert!(second.running);
    assert_eq!(first.fingerprint, second.fingerprint);
    assert_eq!(first.phrase, second.phrase);
}

/// Needs a network with multicast: run by hand with `--ignored`.
#[tokio::test]
#[ignore]
async fn the_real_announcement_is_visible() {
    let (state, _) = state(true).await;
    let dir = tempfile::tempdir().unwrap();
    let s = Sharing::with_options(dir.path(), state, IpAddr::V4(Ipv4Addr::UNSPECIFIED), true);
    let st = s.set(true, Some(0)).await;
    assert!(st.running, "{st:?}");
    let found = bookeeper_net::mdns::browse(Duration::from_secs(5)).await.unwrap();
    assert!(found.iter().any(|f| f.port == st.port && f.tls == "self"));
    s.shutdown().await;
    assert!(!port_is_open(st.port).await);
}
