use bookeeper_server::{bind, build, serve, Config, StartError};

fn cfg(dir: &std::path::Path, port: u16) -> Config {
    Config {
        data_dir: dir.into(),
        bind: "127.0.0.1".parse().unwrap(),
        port,
    }
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
