use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use bookeeper_server::announce::{announcement, instance_for, start};
use bookeeper_server::{Config, Switch, TlsChoice};

fn cfg() -> Config {
    let mut c = Config::for_data_dir("unused");
    c.port = Some(1111);
    c
}

#[test]
fn announcement_carries_port_version_and_mode() {
    for (tls, want) in [
        (TlsChoice::Off, "off"),
        (TlsChoice::SelfSigned, "self"),
        (TlsChoice::Acme, "acme"),
    ] {
        let mut c = cfg();
        c.tls = tls;
        if tls == TlsChoice::Acme {
            c.domains = vec!["libri.example.org".into()];
        }
        let a = announcement(&c, 5555);
        assert_eq!(a.tls, want);
        assert_eq!(a.version, bookeeper_core::VERSION);
        assert_eq!(a.port, 5555);
    }
}

#[test]
fn announcement_url_follows_the_public_url() {
    let mut c = cfg();
    assert_eq!(announcement(&c, 1).url, None);
    c.public_url = Some("http://192.168.1.5:7842/".into());
    assert_eq!(
        announcement(&c, 1).url.as_deref(),
        Some("http://192.168.1.5:7842")
    );
    let mut c = cfg();
    c.tls = TlsChoice::Acme;
    c.domains = vec!["libri.example.org".into()];
    c.port = Some(443);
    assert_eq!(
        announcement(&c, 1).url.as_deref(),
        Some("https://libri.example.org")
    );
}

#[test]
fn instance_mentions_the_host_name() {
    assert!(announcement(&cfg(), 1).instance.starts_with("Bookeeper"));
}

#[test]
fn mdns_off_announces_nothing() {
    let mut c = cfg();
    c.mdns = Switch::Off;
    assert!(start(&c, 1234).is_none());
}

#[test]
fn a_loopback_bind_announces_nothing() {
    let mut c = cfg();
    c.mdns = Switch::On;
    c.bind = "127.0.0.1".parse().unwrap();
    assert!(start(&c, 1234).is_none());
}

#[test]
fn the_server_runs_with_mdns_on() {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let tmp = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["--mdns", "on", "--bind", "0.0.0.0", "--port"])
        .arg(port.to_string())
        .arg("--data-dir")
        .arg(tmp.path().join("data"))
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = tx.send(line);
        }
    });
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut listening = false;
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => {
                if line.contains("in ascolto") {
                    listening = true;
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                let status = child.wait();
                panic!("the server exited before listening: {status:?}");
            }
        }
    }
    let health = if listening {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            reqwest::get(format!("http://127.0.0.1:{port}/api/v1/health"))
                .await
                .map(|r| r.status().is_success())
        })
    } else {
        Ok(false)
    };
    let _ = child.kill();
    let _ = child.wait();
    assert!(listening, "no `in ascolto` line");
    assert!(health.unwrap(), "health check failed");
}

#[test]
fn the_printed_name_is_the_published_name() {
    for host in ["nas.home.lan".to_string(), "h".repeat(100)] {
        let name = instance_for(&host);
        assert_eq!(name, bookeeper_net::mdns::sanitize_instance(&name));
        assert!(!name.contains('.'));
    }
    assert_eq!(instance_for("nas.home.lan"), "Bookeeper su nashomelan");
}
