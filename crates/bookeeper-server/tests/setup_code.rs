use std::io::{BufRead, BufReader};
use std::net::SocketAddr;
use std::path::Path;
use std::process::{Command, Stdio};

use bookeeper_server::{
    bind, build_with_db, issue_setup_code, open_db, serve, startup_setup_code, Config,
};
use serde_json::{json, Value};

fn is_code(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 3
        && parts.iter().all(|p| {
            p.len() == 4 && p.chars().all(|c| c.is_ascii_uppercase() || ('2'..='9').contains(&c))
        })
}

async fn start(dir: &Path) -> (SocketAddr, bookeeper_core::Db) {
    let db = open_db(dir).unwrap();
    let cfg = Config {
        data_dir: dir.into(),
        bind: "127.0.0.1".parse().unwrap(),
        port: 0,
    };
    let listener = bind(&cfg).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_with_db(db.clone()).unwrap();
    tokio::spawn(serve(listener, app));
    (addr, db)
}

async fn post_setup(addr: SocketAddr, code: &str, library: &str) -> (u16, Value) {
    let r = reqwest::Client::new()
        .post(format!("http://{addr}/api/v1/setup"))
        .json(&json!({
            "library_name": library,
            "display_name": "Ada",
            "email": "ada@example.com",
            "password": "correct horse",
            "setup_code": code,
            "device_name": "Laptop",
            "device_kind": "desktop",
        }))
        .send()
        .await
        .unwrap();
    let status = r.status().as_u16();
    (status, r.json().await.unwrap_or(Value::Null))
}

#[tokio::test]
async fn startup_code_exists_only_without_libraries() {
    let tmp = tempfile::tempdir().unwrap();
    let db = open_db(tmp.path()).unwrap();
    let code = startup_setup_code(&db).unwrap().expect("code");
    assert!(is_code(&code), "{code}");
    let (addr, _db) = start(tmp.path()).await;
    assert_eq!(post_setup(addr, &code, "Casa").await.0, 201);
    assert!(startup_setup_code(&db).unwrap().is_none());
}

#[tokio::test]
async fn startup_code_opens_setup_over_http() {
    let tmp = tempfile::tempdir().unwrap();
    let (addr, db) = start(tmp.path()).await;
    let code = startup_setup_code(&db).unwrap().unwrap();
    assert_eq!(post_setup(addr, &code, "Casa").await.0, 201);
}

#[tokio::test]
async fn wrong_code_over_http_is_rejected() {
    let tmp = tempfile::tempdir().unwrap();
    let (addr, db) = start(tmp.path()).await;
    startup_setup_code(&db).unwrap().unwrap();
    let (status, body) = post_setup(addr, "AAAA-AAAA-AAAA", "Casa").await;
    assert_eq!(status, 403);
    assert_eq!(body["error_code"], "setup_code_invalid");
}

#[tokio::test]
async fn issued_code_replaces_the_previous_one() {
    let tmp = tempfile::tempdir().unwrap();
    let (addr, db) = start(tmp.path()).await;
    let old = startup_setup_code(&db).unwrap().unwrap();
    let new = issue_setup_code(&db).unwrap();
    assert_ne!(old, new);
    let (status, body) = post_setup(addr, &old, "Casa").await;
    assert_eq!(status, 403);
    assert_eq!(body["error_code"], "setup_code_invalid");
    assert_eq!(post_setup(addr, &new, "Casa").await.0, 201);
}

#[tokio::test]
async fn issue_works_when_libraries_exist() {
    let tmp = tempfile::tempdir().unwrap();
    let (addr, db) = start(tmp.path()).await;
    let first = startup_setup_code(&db).unwrap().unwrap();
    assert_eq!(post_setup(addr, &first, "Casa").await.0, 201);
    let second = issue_setup_code(&db).unwrap();
    assert_eq!(post_setup(addr, &second, "Ufficio").await.0, 201);
}

#[test]
fn setup_code_subcommand_prints_a_code_and_exits() {
    let tmp = tempfile::tempdir().unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["setup-code", "--data-dir"])
        .arg(tmp.path())
        .output()
        .unwrap();
    assert!(out.status.success(), "{out:?}");
    let stdout = String::from_utf8(out.stdout).unwrap();
    let lines: Vec<&str> = stdout.lines().collect();
    assert_eq!(lines.len(), 1, "{stdout}");
    let code = lines[0].strip_prefix("Codice di setup: ").expect("prefix");
    assert!(is_code(code), "{code}");
    assert!(!stdout.contains("in ascolto"));
}

#[test]
fn server_prints_the_code_on_first_start() {
    let tmp = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["--port", "0", "--bind", "127.0.0.1", "--data-dir"])
        .arg(tmp.path())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let reader = BufReader::new(child.stdout.take().unwrap());
    let found = reader
        .lines()
        .map_while(Result::ok)
        .find_map(|l| l.strip_prefix("Codice di setup: ").map(str::to_owned));
    let _ = child.kill();
    let _ = child.wait();
    let code = found.expect("code line");
    assert!(is_code(&code), "{code}");
}
