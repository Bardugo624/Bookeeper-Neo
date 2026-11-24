use std::process::Command as Process;

use bookeeper_server::{Cli, Config, StartError, Switch, TlsChoice};
use clap::Parser;

fn cfg() -> Config {
    Config::for_data_dir("./data")
}

fn message(e: StartError) -> String {
    match e {
        StartError::Config(m) => m,
        other => panic!("unexpected error: {other}"),
    }
}

#[test]
fn default_port_depends_on_the_tls_mode() {
    let mut c = cfg();
    assert_eq!(c.listen_port(), 7842);
    c.tls = TlsChoice::SelfSigned;
    assert_eq!(c.listen_port(), 7842);
    c.tls = TlsChoice::Acme;
    assert_eq!(c.listen_port(), 443);
    for tls in [TlsChoice::Off, TlsChoice::SelfSigned, TlsChoice::Acme] {
        c.tls = tls;
        c.port = Some(9000);
        assert_eq!(c.listen_port(), 9000);
    }
}

#[test]
fn acme_needs_a_domain() {
    let mut c = cfg();
    c.tls = TlsChoice::Acme;
    assert!(message(c.validate().unwrap_err()).contains("--domain"));
    c.domain = Some("libri.example.org".into());
    c.validate().unwrap();
}

#[test]
fn a_domain_must_be_a_dns_name() {
    let mut c = cfg();
    for bad in ["https://x.org", "x.org:443", "x.org/a", "con spazio"] {
        c.domain = Some(bad.into());
        assert!(
            message(c.validate().unwrap_err()).contains("--domain"),
            "{bad}"
        );
    }
    c.domain = Some("libri.example.org".into());
    c.validate().unwrap();
}

#[test]
fn public_url_must_be_http_or_https() {
    let mut c = cfg();
    for bad in ["libri.example.org", "ftp://x.org", "https://", "http:///"] {
        c.public_url = Some(bad.into());
        assert!(
            message(c.validate().unwrap_err()).contains("--public-url"),
            "{bad}"
        );
    }
    for good in ["http://x.org", "https://x.org/"] {
        c.public_url = Some(good.into());
        c.validate().unwrap();
    }
}

#[test]
fn public_url_is_explicit_or_derived() {
    let mut c = cfg();
    c.public_url = Some("https://x.org:9/".into());
    assert_eq!(c.public_url().as_deref(), Some("https://x.org:9"));

    let mut c = cfg();
    c.tls = TlsChoice::Acme;
    c.domain = Some("libri.example.org".into());
    assert_eq!(c.public_url().as_deref(), Some("https://libri.example.org"));
    c.port = Some(8443);
    assert_eq!(
        c.public_url().as_deref(),
        Some("https://libri.example.org:8443")
    );

    assert_eq!(cfg().public_url(), None);
}

#[test]
fn server_info_reflects_the_configuration() {
    let mut c = cfg();
    c.tls = TlsChoice::Acme;
    c.domain = Some("libri.example.org".into());
    assert!(c.server_info().phone_ready());

    let mut c = cfg();
    c.public_url = Some("https://libri.example.org".into());
    assert!(c.server_info().phone_ready());

    let mut c = cfg();
    c.tls = TlsChoice::SelfSigned;
    c.public_url = Some("https://192.168.1.5:7842".into());
    assert!(!c.server_info().phone_ready());
}

#[test]
fn flags_and_environment_are_read() {
    let cli = Cli::try_parse_from([
        "bookeeper-server",
        "--tls",
        "self",
        "--mdns",
        "off",
        "--bind",
        "127.0.0.1",
    ])
    .unwrap();
    assert_eq!(cli.config.tls, TlsChoice::SelfSigned);
    assert_eq!(cli.config.mdns, Switch::Off);
    assert_eq!(
        cli.config.bind,
        "127.0.0.1".parse::<std::net::IpAddr>().unwrap()
    );
    assert_eq!(cli.config.port, None);

    assert!(Cli::try_parse_from(["bookeeper-server", "--tls", "bogus"]).is_err());
}

#[test]
fn an_invalid_configuration_touches_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("missing");
    let out = Process::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["--tls", "acme", "--data-dir"])
        .arg(&dir)
        .env_remove("BOOKEEPER_DOMAIN")
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("--domain"));
    assert!(!dir.exists());
}
