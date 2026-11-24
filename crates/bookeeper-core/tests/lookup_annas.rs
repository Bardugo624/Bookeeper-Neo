//! Anna's Archive provider: parser on fixtures, HTTP against local servers.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};

use bookeeper_core::lookup::annas::parse;
use bookeeper_core::lookup::{AnnasArchive, Provider};

const ISBN: &str = "9788845292613";

fn fixture(name: &str) -> String {
    let p = format!("{}/tests/fixtures/annas/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(p).unwrap()
}

/// One-shot local server; `raw` is written verbatim. Returns base URL and request line.
fn serve_raw(raw: String) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = tx.send(req.lines().next().unwrap_or("").to_string());
            let _ = s.write_all(raw.as_bytes());
        }
    });
    (base, rx)
}

fn serve(status: &str, body: &str) -> (String, mpsc::Receiver<String>) {
    serve_raw(format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}

#[test]
fn parses_a_result_page() {
    let m = parse(&fixture("result.html"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    assert_eq!(m.authors, vec!["Umberto Eco", "Altro Autore"]);
    assert_eq!(m.publisher.as_deref(), Some("Bompiani"));
    assert_eq!(m.published_year, Some(1980));
    assert_eq!(m.page_count, Some(512));
    assert_eq!(m.language.as_deref(), Some("it"));
    assert_eq!(m.isbn_13.as_deref(), Some(ISBN));
    assert_eq!(m.isbn_10.as_deref(), Some("8845292614"));
    assert_eq!(
        m.cover_candidates,
        vec!["https://covers.example.org/rosa.jpg"]
    );
    assert_eq!(m.sources, vec!["annas-archive"]);
    assert!(m.subtitle.is_none() && m.genre.is_none());
}

#[test]
fn page_without_results_is_none() {
    assert_eq!(parse(&fixture("no_results.html"), ISBN).unwrap(), None);
}

#[test]
fn only_https_cover_urls_are_kept() {
    let m = parse(&fixture("http_cover.html"), ISBN).unwrap().unwrap();
    assert_eq!(m.cover_candidates, vec!["https://covers.example.org/a.jpg"]);
    let m = parse(&fixture("relative_cover.html"), ISBN)
        .unwrap()
        .unwrap();
    assert!(m.cover_candidates.is_empty());
    assert!(m.cover_candidates.iter().all(|u| u.starts_with("https://")));
}

#[test]
fn description_is_plain_text() {
    let m = parse(&fixture("html_description.html"), ISBN)
        .unwrap()
        .unwrap();
    assert_eq!(
        m.description.as_deref(),
        Some("Una storia di \"lupi\" & agnelli")
    );
}

#[test]
fn no_download_links_leak_into_metadata() {
    let m = parse(&fixture("with_downloads.html"), ISBN)
        .unwrap()
        .unwrap();
    assert_eq!(m.title.as_deref(), Some("Libro di prova"));
    let dump = format!("{m:?}").to_lowercase();
    for needle in ["download", "libgen", "md5", "abc123", "get.php"] {
        assert!(!dump.contains(needle), "leaked {needle}: {dump}");
    }
}

#[tokio::test]
async fn falls_back_to_the_next_mirror() {
    let (bad, _) = serve("503 Service Unavailable", "busy");
    let (good, _) = serve("200 OK", &fixture("result.html"));
    let p = AnnasArchive::with_mirrors(reqwest::Client::new(), vec![bad, good]);
    let m = p.lookup(ISBN).await.unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
}

#[tokio::test]
async fn all_mirrors_failing_is_an_error() {
    let (a, _) = serve("503 Service Unavailable", "busy");
    let (b, _) = serve("500 Internal Server Error", "boom");
    let p = AnnasArchive::with_mirrors(reqwest::Client::new(), vec![a, b]);
    assert!(p.lookup(ISBN).await.is_err());
}

#[test]
fn unexpected_html_is_none_or_error_never_a_panic() {
    let page = fixture("result.html");
    let inputs = [
        "<html><body><div><p>hello".to_string(),
        "<<<>>> & &amp &#xZZ; <meta property=\"og:title\" content=".to_string(),
        String::new(),
        page[..page.len() / 2].to_string(),
        page[..120].to_string(),
        "\u{0}\u{1}\u{2}".to_string(),
    ];
    for body in &inputs {
        let _ = parse(body, ISBN); // Ok(None), Ok(Some) or Err: only no panic matters
    }
    assert_eq!(parse("", ISBN).unwrap(), None);
    assert_eq!(parse("<html><body><div><p>hello", ISBN).unwrap(), None);
}

#[tokio::test]
async fn not_found_status_is_none() {
    let (base, _) = serve("404 Not Found", "");
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    assert_eq!(p.lookup(ISBN).await.unwrap(), None);
}

#[tokio::test]
async fn server_error_is_an_error() {
    let (base, _) = serve("500 Internal Server Error", "boom");
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
    let (base, _) = serve("429 Too Many Requests", "slow down");
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}

#[tokio::test]
async fn request_carries_the_isbn() {
    let (base, rx) = serve("200 OK", &fixture("result.html"));
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    p.lookup("978-88-452-9261-3").await.unwrap();
    let line = rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
    assert!(line.starts_with("GET "), "{line}");
    assert!(line.contains(ISBN), "{line}");
}

#[tokio::test]
async fn malformed_body_is_an_error_not_a_panic() {
    // Declared length longer than what is sent: the body read fails.
    let (base, _) = serve_raw(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5000\r\nConnection: close\r\n\r\n<html><head>"
            .to_string(),
    );
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}

#[tokio::test]
async fn invalid_utf8_body_is_an_error() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let _ = s.read(&mut buf);
            let mut resp =
                b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n".to_vec();
            resp.extend_from_slice(&[0xff, 0xfe, 0xfd, 0xfc]);
            let _ = s.write_all(&resp);
        }
    });
    let p = AnnasArchive::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}

#[test]
fn name_is_stable() {
    assert_eq!(
        AnnasArchive::new(reqwest::Client::new()).name(),
        "annas-archive"
    );
}

/// Local server answering every request with `respond(request_line)`; counts requests.
fn serve_loop(respond: impl Fn(&str) -> String + Send + 'static) -> (String, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let hits = Arc::new(AtomicUsize::new(0));
    let h = hits.clone();
    std::thread::spawn(move || {
        while let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            h.fetch_add(1, Ordering::SeqCst);
            let _ = s.write_all(respond(req.lines().next().unwrap_or("")).as_bytes());
        }
    });
    (base, hits)
}

fn redirect_to(loc: &str) -> String {
    format!(
        "HTTP/1.1 302 Found\r\nLocation: {loc}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    )
}

fn ok_page() -> String {
    let body = fixture("result.html");
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

#[tokio::test]
async fn shared_client_does_not_follow_redirects() {
    let (target, target_hits) = serve_loop(|_| ok_page());
    let (base, _) = serve_loop(move |_| redirect_to(&format!("{target}/x")));
    let state = bookeeper_core::state::AppState::for_tests();
    let resp = state.http.get(format!("{base}/a")).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 302);
    assert_eq!(target_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn redirect_inside_the_mirror_list_is_followed() {
    let (second, _) = serve_loop(|_| ok_page());
    let target = second.clone();
    let (first, _) = serve_loop(move |_| redirect_to(&format!("{target}/isbn/{ISBN}")));
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let p = AnnasArchive::with_mirrors(client, vec![first, second]);
    let m = p.lookup(ISBN).await.unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
}

#[tokio::test]
async fn redirect_to_a_foreign_host_is_not_followed() {
    let (foreign, foreign_hits) = serve_loop(|_| ok_page());
    let (first, _) = serve_loop(move |_| redirect_to(&format!("{foreign}/isbn/{ISBN}")));
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let p = AnnasArchive::with_mirrors(client, vec![first]);
    assert!(p.lookup(ISBN).await.is_err());
    assert_eq!(foreign_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn redirect_loops_stop_after_three_hops() {
    let (base, hits) = serve_loop(|_| redirect_to("/isbn/9788845292613"));
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let p = AnnasArchive::with_base_url(client, &base);
    assert!(p.lookup(ISBN).await.is_err());
    assert_eq!(hits.load(Ordering::SeqCst), 4);
}

#[test]
fn first_language_label_wins() {
    let body = "<html><head><meta property=\"og:title\" content=\"T\"></head><body>Lingua: it Language: en</body></html>";
    assert_eq!(
        parse(body, ISBN).unwrap().unwrap().language.as_deref(),
        Some("it")
    );
}

#[tokio::test]
async fn unparseable_200_tries_the_next_mirror() {
    let (bad, _) = serve("200 OK", "<html><body>parked</body></html>");
    let (good, _) = serve("200 OK", &fixture("result.html"));
    let p = AnnasArchive::with_mirrors(reqwest::Client::new(), vec![bad, good]);
    assert!(p.lookup(ISBN).await.unwrap().is_some());
}
