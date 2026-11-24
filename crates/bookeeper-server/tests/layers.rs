use std::net::SocketAddr;

use bookeeper_core::{ServerInfo, TlsMode};
use bookeeper_server::{
    app_state, bind, build, build_with_state, open_db, serve, startup_setup_code, Config,
};
use reqwest::header::HeaderMap;
use serde_json::{json, Value};

fn cfg(dir: &std::path::Path) -> Config {
    let mut c = Config::for_data_dir(dir);
    c.bind = "127.0.0.1".parse().unwrap();
    c.port = Some(0);
    c
}

async fn start() -> SocketAddr {
    let tmp = tempfile::tempdir().unwrap();
    let c = cfg(&tmp.path().join("data"));
    let listener = bind(&c).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _keep = tmp;
        let _ = serve(listener, build(&c).unwrap()).await;
    });
    addr
}

async fn headers_of(addr: SocketAddr, path: &str) -> HeaderMap {
    reqwest::get(format!("http://{addr}{path}"))
        .await
        .unwrap()
        .headers()
        .clone()
}

fn assert_security(h: &HeaderMap, what: &str) {
    assert_eq!(h["x-content-type-options"], "nosniff", "{what}");
    assert_eq!(h["referrer-policy"], "no-referrer", "{what}");
    assert_eq!(h["x-frame-options"], "DENY", "{what}");
}

#[tokio::test]
async fn api_and_web_responses_carry_the_security_headers() {
    let addr = start().await;
    for path in ["/api/v1/health", "/", "/api/v1/non-esiste"] {
        assert_security(&headers_of(addr, path).await, path);
    }
}

#[tokio::test]
async fn api_responses_are_not_cached() {
    let addr = start().await;
    assert_eq!(
        headers_of(addr, "/api/v1/health").await["cache-control"],
        "no-store"
    );
    let root = headers_of(addr, "/").await;
    let cc = root.get("cache-control").map(|v| v.to_str().unwrap());
    assert!(!cc.unwrap_or("").contains("no-store"), "{cc:?}");
}

#[tokio::test]
async fn a_handler_cache_policy_is_kept() {
    let tmp = tempfile::tempdir().unwrap();
    let c = cfg(tmp.path());
    let db = open_db(tmp.path()).unwrap();
    let code = startup_setup_code(&db).unwrap().unwrap();
    let state = app_state(db.clone(), &c).unwrap();
    let covers_dir = state.files.covers_dir.clone();
    let listener = bind(&c).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(serve(listener, build_with_state(state)));

    let http = reqwest::Client::new();
    let base = format!("http://{addr}/api/v1");
    let setup: Value = http
        .post(format!("{base}/setup"))
        .json(&json!({
            "library_name": "Casa", "display_name": "Ada", "email": "ada@example.com",
            "password": "correct horse", "setup_code": code,
            "device_name": "Laptop", "device_kind": "desktop",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = setup["session"]["access_token"]
        .as_str()
        .unwrap()
        .to_string();
    let book: Value = http
        .post(format!("{base}/books"))
        .bearer_auth(&token)
        .json(&json!({"title": "Dune", "authors": []}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = book["id"].as_str().unwrap().to_string();

    // Registers a cover the way the core does: a file plus the `cover_file` column.
    std::fs::create_dir_all(&covers_dir).unwrap();
    std::fs::write(covers_dir.join(format!("{id}.jpg")), b"not really a jpeg").unwrap();
    let bid = id.clone();
    db.run(move |conn| {
        conn.execute(
            &format!("UPDATE books SET cover_file = '{bid}.jpg' WHERE id = '{bid}'"),
            [],
        )
    })
    .await
    .unwrap();

    let res = http
        .get(format!("{base}/books/{id}/cover"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let h = res.headers();
    assert!(h.contains_key("etag"));
    let cc = h["cache-control"].to_str().unwrap();
    assert!(!cc.contains("no-store"), "{cc}");
    assert_eq!(cc, "private, max-age=86400");
    assert_security(h, "cover");
}

async fn hsts_for(info: ServerInfo) -> bool {
    let tmp = tempfile::tempdir().unwrap();
    let c = cfg(tmp.path());
    let state = app_state(open_db(tmp.path()).unwrap(), &c)
        .unwrap()
        .with_server(info);
    let listener = bind(&c).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(serve(listener, build_with_state(state)));
    let h = headers_of(addr, "/api/v1/health").await;
    match h.get("strict-transport-security") {
        Some(v) => {
            assert_eq!(v, "max-age=31536000");
            true
        }
        None => false,
    }
}

#[tokio::test]
async fn hsts_follows_the_tls_mode() {
    let info = |tls, url: Option<&str>| ServerInfo {
        tls,
        public_url: url.map(String::from),
    };
    assert!(!hsts_for(info(TlsMode::Off, None)).await);
    assert!(!hsts_for(info(TlsMode::Off, Some("http://casa.local"))).await);
    assert!(hsts_for(info(TlsMode::Off, Some("https://libri.example.org"))).await);
    assert!(hsts_for(info(TlsMode::Acme, Some("https://libri.example.org"))).await);
    assert!(!hsts_for(info(TlsMode::SelfSigned, Some("https://192.168.1.2:8443"))).await);
    assert!(!hsts_for(info(TlsMode::Local, None)).await);
}

#[tokio::test]
async fn the_json_404_under_api_is_unchanged() {
    let addr = start().await;
    let res = reqwest::get(format!("http://{addr}/api/v1/non-esiste"))
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
    let body: Value = res.json().await.unwrap();
    let obj = body.as_object().unwrap();
    assert_eq!(obj.len(), 2, "{body}");
    assert!(obj["error_code"].is_string());
    assert!(obj["message"].is_string());
}
