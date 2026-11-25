use std::net::SocketAddr;
use std::process::Command;
use std::time::{Duration, Instant};

use bookeeper_server::health::check;
use bookeeper_server::{bind, build, serve, Config, TlsChoice};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

fn cfg(port: u16) -> Config {
    let mut c = Config::for_data_dir("unused");
    c.bind = "127.0.0.1".parse().unwrap();
    c.port = Some(port);
    c
}

async fn listener() -> (TcpListener, SocketAddr) {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let a = l.local_addr().unwrap();
    (l, a)
}

#[tokio::test]
async fn succeeds_against_a_running_server() {
    let tmp = tempfile::tempdir().unwrap();
    let mut c = cfg(0);
    c.data_dir = tmp.path().join("data");
    let l = bind(&c).await.unwrap();
    let port = l.local_addr().unwrap().port();
    tokio::spawn(serve(l, build(&c).unwrap()));
    assert_eq!(check(&cfg(port)).await, Ok(()));
}

#[tokio::test]
async fn fails_when_nothing_listens() {
    let (l, a) = listener().await;
    drop(l);
    let start = Instant::now();
    assert!(check(&cfg(a.port())).await.is_err());
    assert!(start.elapsed() < Duration::from_secs(3));
}

#[tokio::test]
async fn fails_when_the_port_answers_something_else() {
    let (l, a) = listener().await;
    tokio::spawn(async move {
        loop {
            let (mut s, _) = l.accept().await.unwrap();
            let _ = s
                .write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n")
                .await;
        }
    });
    assert!(check(&cfg(a.port())).await.is_err());
}

#[tokio::test]
async fn fails_on_a_silent_peer_within_the_timeout() {
    let (l, a) = listener().await;
    tokio::spawn(async move {
        let mut held = Vec::new();
        loop {
            held.push(l.accept().await.unwrap());
        }
    });
    let start = Instant::now();
    assert!(check(&cfg(a.port())).await.is_err());
    assert!(start.elapsed() < Duration::from_secs(4));
}

#[tokio::test]
async fn tls_modes_only_need_the_port_open() {
    let (_l, a) = listener().await;
    for tls in [TlsChoice::SelfSigned, TlsChoice::Acme] {
        let mut c = cfg(a.port());
        c.tls = tls;
        assert_eq!(check(&c).await, Ok(()));
    }
}

#[tokio::test]
async fn the_subcommand_exits_0_or_1_and_creates_no_data_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let data = tmp.path().join("missing");
    let run = |port: u16| {
        let data = data.clone();
        async move {
            tokio::task::spawn_blocking(move || {
                Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
                    .args(["healthcheck", "--data-dir"])
                    .arg(&data)
                    .args(["--port", &port.to_string()])
                    .output()
                    .unwrap()
            })
            .await
            .unwrap()
        }
    };
    let (l, a) = listener().await;
    let responder = tokio::spawn(async move {
        loop {
            let Ok((mut s, _)) = l.accept().await else {
                break;
            };
            let _ = s
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
                .await;
        }
    });
    let ok = run(a.port()).await;
    assert_eq!(ok.status.code(), Some(0));
    assert!(ok.stdout.is_empty());
    responder.abort();
    let _ = responder.await;
    let bad = run(a.port()).await;
    assert_eq!(bad.status.code(), Some(1));
    assert!(!bad.stderr.is_empty());
    assert!(!data.exists());
}
