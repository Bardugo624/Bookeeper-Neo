use std::time::{Duration, Instant};

use bookeeper_net::mdns::*;
use bookeeper_net::NetError;

fn ann(url: Option<&str>) -> Announcement {
    Announcement {
        instance: "Casa".into(),
        port: 8080,
        version: "2.0.0".into(),
        tls: "self".into(),
        url: url.map(str::to_string),
    }
}

#[test]
fn instance_names_are_sanitized() {
    assert_eq!(sanitize_instance("a.b\u{7}c\n"), "abc");
    let long = "è".repeat(100);
    let s = sanitize_instance(&long);
    assert!(s.len() <= 63 && !s.is_empty());
    assert!(s.chars().all(|c| c == 'è'));
    assert_eq!(sanitize_instance(""), "Bookeeper");
    assert_eq!(sanitize_instance("..\t"), "Bookeeper");
}

#[test]
fn txt_records_carry_only_the_public_fields() {
    let keys = |a: &Announcement| {
        let mut k: Vec<String> = txt_records(a).into_iter().map(|(k, _)| k).collect();
        k.sort();
        k
    };
    assert_eq!(keys(&ann(None)), ["path", "tls", "v"]);
    assert_eq!(
        keys(&ann(Some("https://x.example"))),
        ["path", "tls", "url", "v"]
    );
    let t = txt_records(&ann(Some("https://x.example")));
    assert!(t.contains(&("v".into(), "2.0.0".into())));
    assert!(t.contains(&("tls".into(), "self".into())));
    assert!(t.contains(&("path".into(), "/api/v1".into())));
    assert!(t.contains(&("url".into(), "https://x.example".into())));
}

#[test]
fn found_is_built_from_txt() {
    let addrs = vec!["192.168.1.5".parse().unwrap()];
    let txt: Vec<(String, String)> = [("v", "2.0.0"), ("tls", "self"), ("url", "https://a")]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    let f = found_from_txt("Casa", "casa.local.", addrs.clone(), 8080, &txt);
    assert_eq!(f.instance, "Casa");
    assert_eq!(f.host, "casa.local.");
    assert_eq!(f.addrs, addrs);
    assert_eq!(f.port, 8080);
    assert_eq!((f.version.as_str(), f.tls.as_str()), ("2.0.0", "self"));
    assert_eq!(f.url.as_deref(), Some("https://a"));

    let f = found_from_txt("Casa", "h.", vec![], 1, &[]);
    assert_eq!((f.version.as_str(), f.tls.as_str(), f.url), ("", "", None));

    let big = vec![
        ("url".to_string(), "x".repeat(256)),
        ("v".to_string(), "1".into()),
    ];
    let f = found_from_txt("Casa", "h.", vec![], 1, &big);
    assert_eq!(f.url, None);
    assert_eq!(f.version, "1");
}

// needs multicast
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn announce_then_browse_finds_the_service() {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let instance = format!("bk-test-{}", std::process::id() ^ (port as u32) << 8);
    let a = Announcement {
        instance: instance.clone(),
        port,
        version: "9.9.9".into(),
        tls: "off".into(),
        url: None,
    };
    let announcer = announce(&a).expect("announce");
    let found = browse(Duration::from_secs(3)).await.expect("browse");
    let f = found
        .iter()
        .find(|f| f.instance == instance)
        .expect("instance found");
    assert_eq!(f.port, port);
    assert_eq!(f.version, "9.9.9");
    assert_eq!(f.tls, "off");
    assert_eq!(f.url, None);
    drop(announcer);
    let found = browse(Duration::from_secs(3)).await.expect("browse");
    assert!(found.iter().all(|f| f.instance != instance));
}

#[test]
fn announce_reports_errors_instead_of_panicking() {
    match announce(&ann(None)) {
        Ok(announcer) => {
            let t = Instant::now();
            drop(announcer);
            assert!(t.elapsed() < Duration::from_secs(2));
        }
        Err(NetError::Mdns(_)) => {}
        Err(e) => panic!("unexpected error: {e}"),
    }
}
