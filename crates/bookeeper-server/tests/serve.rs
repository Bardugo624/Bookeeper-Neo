use bookeeper_server::{bind, build, serve, Config, StartError};

fn cfg(dir: &std::path::Path, port: u16) -> Config {
    let mut cfg = Config::for_data_dir(dir);
    cfg.bind = "127.0.0.1".parse().unwrap();
    cfg.port = Some(port);
    cfg
}

#[tokio::test]
async fn serves_health_and_creates_data_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let data = tmp.path().join("nested/data");
    let c = cfg(&data, 0);
    let listener = bind(&c).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(serve(listener, build(&c).unwrap()));
    let body: serde_json::Value = reqwest::get(format!("http://{addr}/api/v1/health"))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["status"], "ok");
    assert!(data.join("bookeeper.sqlite").exists());
}

#[tokio::test]
async fn busy_port_error_names_the_port() {
    let tmp = tempfile::tempdir().unwrap();
    let first = bind(&cfg(tmp.path(), 0)).await.unwrap();
    let port = first.local_addr().unwrap().port();
    let err = bind(&cfg(tmp.path(), port)).await.unwrap_err();
    assert!(matches!(err, StartError::Bind { .. }));
    assert!(err.to_string().contains(&port.to_string()));
}

#[test]
fn unwritable_data_dir_error_names_the_path() {
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("not-a-dir");
    std::fs::write(&file, b"x").unwrap();
    let err = build(&cfg(&file.join("data"), 0)).unwrap_err();
    assert!(matches!(err, StartError::DataDir { .. }));
    assert!(err.to_string().contains("not-a-dir"));
}

async fn start() -> std::net::SocketAddr {
    let tmp = tempfile::tempdir().unwrap();
    let c = cfg(&tmp.path().join("data"), 0);
    let listener = bind(&c).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _keep = tmp;
        let _ = serve(listener, build(&c).unwrap()).await;
    });
    addr
}

#[tokio::test]
async fn root_serves_the_web_app() {
    let res = reqwest::get(format!("http://{}/", start().await))
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    assert!(res.headers()["content-type"]
        .to_str()
        .unwrap()
        .starts_with("text/html"));
}

#[tokio::test]
async fn unknown_page_falls_back_to_the_web_app() {
    let res = reqwest::get(format!("http://{}/pair/ABCD2345", start().await))
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    assert!(res.headers()["content-type"]
        .to_str()
        .unwrap()
        .starts_with("text/html"));
}

#[tokio::test]
async fn unknown_api_route_never_gets_html() {
    let res = reqwest::get(format!("http://{}/api/v1/nope", start().await))
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
    assert_eq!(res.headers()["content-type"], "application/json");
}

#[tokio::test]
async fn missing_asset_is_not_the_web_app() {
    let res = reqwest::get(format!("http://{}/assets/nope.js", start().await))
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
}

#[tokio::test]
async fn posting_to_a_page_is_rejected() {
    let res = reqwest::Client::new()
        .post(format!("http://{}/pair/ABCD2345", start().await))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 405);
}

#[tokio::test]
async fn unknown_api_route_keeps_the_error_code() {
    let body: serde_json::Value = reqwest::get(format!("http://{}/api/v1/nope", start().await))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["error_code"], "not_found");
}

#[tokio::test]
async fn wrong_method_on_api_route_is_json_405() {
    let res = reqwest::Client::new()
        .delete(format!("http://{}/api/v1/health", start().await))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 405);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["error_code"], "method_not_allowed");
}

#[tokio::test]
async fn dot_segments_never_serve_files_outside_the_web_app() {
    let addr = start().await;
    // Raw request: HTTP clients normalise `..` away before sending.
    for path in [
        "/../Cargo.toml",
        "/assets/../../Cargo.toml",
        "/..%2fCargo.toml",
    ] {
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        tokio::io::AsyncWriteExt::write_all(
            &mut stream,
            format!("GET {path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .await
        .unwrap();
        let mut response = String::new();
        tokio::io::AsyncReadExt::read_to_string(&mut stream, &mut response)
            .await
            .unwrap();
        assert!(!response.contains("[package]"), "{path} leaked a file");
        assert!(!response.contains("[workspace]"), "{path} leaked a file");
    }
}

#[tokio::test]
async fn pages_declare_utf8_and_forbid_sniffing() {
    let res = reqwest::get(format!("http://{}/", start().await))
        .await
        .unwrap();
    assert_eq!(res.headers()["content-type"], "text/html; charset=utf-8");
    assert_eq!(res.headers()["x-content-type-options"], "nosniff");
}
