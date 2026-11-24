use std::io::{BufRead, BufReader};
use std::net::SocketAddr;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use bookeeper_net::tls::pinned_client_config;
use bookeeper_server::{
    app_state, bind, build_with_state, load_self_identity, open_db, Config, TlsChoice, TlsServer,
};
use tokio::sync::oneshot;

struct Running {
    addr: SocketAddr,
    fingerprint: [u8; 32],
    stop: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
}

fn self_cfg(dir: &Path) -> Config {
    let mut c = Config::for_data_dir(dir);
    c.bind = "127.0.0.1".parse().unwrap();
    c.port = Some(0);
    c.tls = TlsChoice::SelfSigned;
    c
}

async fn start_self(dir: &Path) -> Running {
    let cfg = self_cfg(dir);
    let listener = bind(&cfg).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let db = open_db(dir).unwrap();
    let app = build_with_state(app_state(db, &cfg).unwrap());
    let identity = load_self_identity(&cfg).unwrap();
    let (stop, rx) = oneshot::channel::<()>();
    let server = TlsServer::self_signed(listener, &identity).unwrap();
    let task = tokio::spawn(server.serve_until(app, async {
        let _ = rx.await;
    }));
    Running {
        addr,
        fingerprint: identity.fingerprint,
        stop,
        task,
    }
}

impl Running {
    async fn shutdown(self) {
        let _ = self.stop.send(());
        let r = tokio::time::timeout(Duration::from_secs(12), self.task)
            .await
            .expect("shutdown in time")
            .unwrap();
        r.unwrap();
    }
}

fn pinned(fp: [u8; 32]) -> reqwest::Client {
    reqwest::Client::builder()
        .use_preconfigured_tls((*pinned_client_config(fp)).clone())
        .build()
        .unwrap()
}

#[tokio::test]
async fn self_mode_serves_https_with_the_pinned_identity() {
    let tmp = tempfile::tempdir().unwrap();
    let s = start_self(tmp.path()).await;
    let r = pinned(s.fingerprint)
        .get(format!("https://{}/api/v1/health", s.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    // A different pin must be refused.
    let mut wrong = s.fingerprint;
    wrong[0] ^= 0xFF;
    assert!(pinned(wrong)
        .get(format!("https://{}/api/v1/health", s.addr))
        .send()
        .await
        .is_err());
    s.shutdown().await;
}

#[tokio::test]
async fn self_mode_rejects_plain_http() {
    let tmp = tempfile::tempdir().unwrap();
    let s = start_self(tmp.path()).await;
    let res = reqwest::Client::new()
        .get(format!("http://{}/api/v1/health", s.addr))
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    assert!(res.is_err(), "{res:?}");
    s.shutdown().await;
}

#[tokio::test]
async fn self_mode_keeps_its_identity_across_restarts() {
    let tmp = tempfile::tempdir().unwrap();
    let a = start_self(tmp.path()).await;
    let first = a.fingerprint;
    a.shutdown().await;
    let b = start_self(tmp.path()).await;
    assert_eq!(first, b.fingerprint);
    b.shutdown().await;
}

#[tokio::test]
async fn server_info_reports_self_and_no_phone() {
    let tmp = tempfile::tempdir().unwrap();
    let s = start_self(tmp.path()).await;
    let body: serde_json::Value = pinned(s.fingerprint)
        .get(format!("https://{}/api/v1/server", s.addr))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["tls"], "self");
    assert_eq!(body["phone_ready"], false);
    s.shutdown().await;
}

#[test]
fn fingerprint_subcommand_prints_what_the_server_printed() {
    let tmp = tempfile::tempdir().unwrap();
    let data = tmp.path().join("data");
    let mut child = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args([
            "--tls",
            "self",
            "--port",
            "0",
            "--bind",
            "127.0.0.1",
            "--mdns",
            "off",
        ])
        .arg("--data-dir")
        .arg(&data)
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let lines: Vec<String> = BufReader::new(child.stdout.take().unwrap())
        .lines()
        .map_while(Result::ok)
        .take(4)
        .collect();
    let _ = child.kill();
    let _ = child.wait();
    assert_eq!(lines.len(), 4, "{lines:?}");
    assert!(lines[0].starts_with("Codice di setup: "));
    assert!(lines[1].starts_with("Bookeeper ") && lines[1].contains("in ascolto su https://"));
    assert!(lines[2].starts_with("Impronta del certificato: "));
    assert!(lines[3].starts_with("Frase di verifica: "));

    let out = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["fingerprint", "--data-dir"])
        .arg(&data)
        .output()
        .unwrap();
    assert!(out.status.success(), "{out:?}");
    let stdout = String::from_utf8(out.stdout).unwrap();
    let got: Vec<&str> = stdout.lines().collect();
    assert_eq!(got, vec![lines[2].as_str(), lines[3].as_str()]);

    let empty = tmp.path().join("empty");
    let out = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["fingerprint", "--data-dir"])
        .arg(&empty)
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1), "{out:?}");
    assert!(String::from_utf8_lossy(&out.stderr).contains("--tls self"));
    assert!(!empty.join("tls").exists());
}

#[tokio::test]
async fn acme_mode_starts_and_listens_without_a_certificate() {
    let tmp = tempfile::tempdir().unwrap();
    let mut cfg = Config::for_data_dir(tmp.path());
    cfg.bind = "127.0.0.1".parse().unwrap();
    cfg.port = Some(0);
    cfg.tls = TlsChoice::Acme;
    cfg.domains = vec!["libri.example.org".into()];
    cfg.acme_directory = Some("https://127.0.0.1:1/dir".into());
    cfg.validate().unwrap();
    let listener = bind(&cfg).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_with_state(app_state(open_db(tmp.path()).unwrap(), &cfg).unwrap());
    let (stop, rx) = oneshot::channel::<()>();
    let task = tokio::spawn(
        TlsServer::acme(listener, &cfg)
            .unwrap()
            .serve_until(app, async {
                let _ = rx.await;
            }),
    );

    let tcp = tokio::time::timeout(Duration::from_secs(5), tokio::net::TcpStream::connect(addr))
        .await
        .expect("connect in time");
    assert!(tcp.is_ok());
    drop(tcp);
    // The handshake cannot succeed (no certificate): it fails or stays pending.
    let hs = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap()
        .get(format!("https://{addr}/api/v1/health"))
        .send()
        .await;
    assert!(hs.is_err());
    assert!(!task.is_finished());

    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), task)
        .await
        .expect("graceful shutdown")
        .unwrap()
        .unwrap();
}

fn acme_cfg(dir: &Path, domains: &[&str]) -> Config {
    let mut cfg = Config::for_data_dir(dir);
    cfg.bind = "127.0.0.1".parse().unwrap();
    cfg.port = Some(0);
    cfg.tls = TlsChoice::Acme;
    cfg.domains = domains.iter().map(|d| d.to_string()).collect();
    cfg.acme_directory = Some("https://127.0.0.1:1/dir".into());
    cfg
}

#[test]
fn self_names_include_every_domain() {
    let tmp = tempfile::tempdir().unwrap();
    let mut cfg = self_cfg(tmp.path());
    cfg.domains = vec!["a.example.org".into(), "B.example.org".into()];
    let names = bookeeper_server::tls::self_names(&cfg);
    assert!(names.contains(&"a.example.org".to_string()), "{names:?}");
    assert!(names.contains(&"b.example.org".to_string()), "{names:?}");
}

#[tokio::test]
async fn acme_mode_starts_with_two_domains() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = acme_cfg(tmp.path(), &["mobile.example.org", "app.example.org"]);
    cfg.validate().unwrap();
    let listener = bind(&cfg).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_with_state(app_state(open_db(tmp.path()).unwrap(), &cfg).unwrap());
    let (stop, rx) = oneshot::channel::<()>();
    let task = tokio::spawn(
        TlsServer::acme(listener, &cfg)
            .unwrap()
            .serve_until(app, async {
                let _ = rx.await;
            }),
    );
    let tcp = tokio::time::timeout(Duration::from_secs(5), tokio::net::TcpStream::connect(addr))
        .await
        .expect("connect in time");
    assert!(tcp.is_ok());
    drop(tcp);
    assert!(!task.is_finished());
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), task)
        .await
        .expect("graceful shutdown")
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn acme_mode_drops_a_silent_connection() {
    use tokio::io::AsyncReadExt;
    let tmp = tempfile::tempdir().unwrap();
    let cfg = acme_cfg(tmp.path(), &["libri.example.org"]);
    let listener = bind(&cfg).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_with_state(app_state(open_db(tmp.path()).unwrap(), &cfg).unwrap());
    let (stop, rx) = oneshot::channel::<()>();
    let task = tokio::spawn(
        TlsServer::acme(listener, &cfg)
            .unwrap()
            .serve_until(app, async {
                let _ = rx.await;
            }),
    );
    let mut tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut buf = [0u8; 16];
    let read = tokio::time::timeout(Duration::from_secs(15), tcp.read(&mut buf))
        .await
        .expect("the silent connection must be closed within 15 seconds");
    // End of stream or an error: either way the server let go.
    assert!(matches!(read, Ok(0) | Err(_)), "{read:?}");
    let _ = stop.send(());
    let _ = tokio::time::timeout(Duration::from_secs(5), task).await;
}
