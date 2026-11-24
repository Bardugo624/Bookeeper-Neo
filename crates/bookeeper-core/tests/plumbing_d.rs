use bookeeper_core::{AppState, ServerInfo, TlsMode};

fn info(tls: TlsMode, url: Option<&str>) -> ServerInfo {
    ServerInfo {
        tls,
        public_url: url.map(String::from),
    }
}

#[test]
fn the_local_core_is_not_phone_ready() {
    let i = ServerInfo::local();
    assert_eq!(i.tls, TlsMode::Local);
    assert_eq!(i.public_url, None);
    assert!(!i.phone_ready());
}

#[test]
fn phone_ready_needs_https_and_a_real_certificate() {
    assert!(info(TlsMode::Acme, Some("https://libri.example.org")).phone_ready());
    assert!(info(TlsMode::Off, Some("https://libri.example.org")).phone_ready());
    assert!(!info(TlsMode::Off, Some("http://192.168.1.5:7842")).phone_ready());
    assert!(!info(TlsMode::Off, None).phone_ready());
    assert!(!info(TlsMode::SelfSigned, Some("https://192.168.1.5:7842")).phone_ready());
}

#[test]
fn tls_mode_serializes_to_the_contract_names() {
    let name = |m: TlsMode| serde_json::to_string(&m).unwrap();
    assert_eq!(name(TlsMode::Local), "\"local\"");
    assert_eq!(name(TlsMode::Off), "\"off\"");
    assert_eq!(name(TlsMode::SelfSigned), "\"self\"");
    assert_eq!(name(TlsMode::Acme), "\"acme\"");
}

#[test]
fn with_server_replaces_the_value() {
    let state = AppState::for_tests();
    assert_eq!(*state.server, ServerInfo::local());
    let state = state.with_server(info(TlsMode::Acme, Some("https://x.example")));
    assert_eq!(state.server.tls, TlsMode::Acme);
    assert_eq!(
        state.server.public_url.as_deref(),
        Some("https://x.example")
    );
}
