use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;

use bookeeper_core::lookup::openlibrary::parse;
use bookeeper_core::lookup::{OpenLibrary, Provider};

const ISBN: &str = "9788804668237";

fn fixture(name: &str) -> String {
    let dir = std::env::var("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR is not set: run the test through `cargo test`");
    let path = format!("{dir}/tests/fixtures/openlibrary/{name}");
    std::fs::read_to_string(path).unwrap()
}

/// One-shot local server: answers with `status`/`body`, reports the request line.
fn serve(status: u16, body: &'static str) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = tx.send(req.lines().next().unwrap_or("").to_string());
            let resp = format!(
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = s.write_all(resp.as_bytes());
        }
    });
    (base, rx)
}

#[test]
fn parses_a_full_record() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    assert_eq!(m.subtitle.as_deref(), Some("romanzo"));
    assert_eq!(m.page_count, Some(503));
    assert_eq!(m.published_year, Some(1980));
    assert_eq!(m.genre.as_deref(), Some("Fiction"));
    assert_eq!(m.isbn_13.as_deref(), Some(ISBN));
    assert_eq!(m.isbn_10.as_deref(), Some("880466823X"));
    assert_eq!(
        m.description.as_deref(),
        Some("In principio era il Verbo & basta.")
    );
    assert_eq!(m.language, None);
    assert_eq!(m.sources, vec!["open-library".to_string()]);
}

#[test]
fn empty_object_is_none() {
    assert_eq!(parse(&fixture("empty.json"), ISBN).unwrap(), None);
}

#[test]
fn record_under_another_key_is_none() {
    assert_eq!(parse(&fixture("other_key.json"), ISBN).unwrap(), None);
}

#[test]
fn authors_and_publisher_come_from_name_fields() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.authors, vec!["Umberto Eco", "William Weaver"]);
    assert_eq!(m.publisher.as_deref(), Some("Mondadori"));
}

#[test]
fn year_is_extracted_from_free_text_dates() {
    for date in ["March 1980", "1980", "12 May, 1980"] {
        let body = format!(r#"{{"ISBN:{ISBN}": {{"publish_date": "{date}"}}}}"#);
        let m = parse(&body, ISBN).unwrap().unwrap();
        assert_eq!(m.published_year, Some(1980), "{date}");
    }
    let body = format!(r#"{{"ISBN:{ISBN}": {{"publish_date": "n.d. 12345"}}}}"#);
    assert_eq!(parse(&body, ISBN).unwrap().unwrap().published_year, None);
}

#[test]
fn cover_candidates_end_with_the_isbn_url() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    assert_eq!(
        m.cover_candidates,
        vec![
            "https://covers.openlibrary.org/b/id/1-L.jpg".to_string(),
            "https://covers.openlibrary.org/b/id/1-M.jpg".to_string(),
            format!("https://covers.openlibrary.org/b/isbn/{ISBN}-L.jpg?default=false"),
        ]
    );
}

#[test]
fn missing_fields_are_absent() {
    let m = parse(&fixture("sparse.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Only a title"));
    assert!(m.authors.is_empty());
    assert_eq!(m.page_count, None);
    assert_eq!(m.publisher, None);
    assert_eq!(m.isbn_13, None);
    assert_eq!(m.isbn_10, None);
    assert_eq!(m.description, None);
    assert_eq!(m.genre, None);
    assert_eq!(m.published_year, None);
    assert_eq!(m.cover_candidates.len(), 1);
}

#[tokio::test]
async fn not_found_status_is_none() {
    let (base, _rx) = serve(404, "{}");
    let p = OpenLibrary::with_base_url(reqwest::Client::new(), &base);
    assert_eq!(p.lookup(ISBN).await.unwrap(), None);
}

#[tokio::test]
async fn server_error_is_an_error() {
    let (base, _rx) = serve(503, "oops");
    let p = OpenLibrary::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}

#[tokio::test]
async fn request_carries_the_isbn() {
    let body: &'static str = Box::leak(fixture("full.json").into_boxed_str());
    let (base, rx) = serve(200, body);
    let p = OpenLibrary::with_base_url(reqwest::Client::new(), &base);
    let m = p.lookup(ISBN).await.unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    let line = rx.recv().unwrap();
    assert!(line.starts_with("GET /api/books?"), "{line}");
    assert!(
        line.contains(&format!("bibkeys=ISBN%3A{ISBN}"))
            || line.contains(&format!("bibkeys=ISBN:{ISBN}")),
        "{line}"
    );
    assert!(
        line.contains("jscmd=data") && line.contains("format=json"),
        "{line}"
    );
    assert_eq!(p.name(), "open-library");
}

#[test]
fn malformed_body_is_an_error_not_a_panic() {
    assert!(parse("<html>nope</html>", ISBN).is_err());
    assert!(parse("[1,2]", ISBN).is_err());
    assert!(parse("", ISBN).is_err());
}

#[test]
fn a_bare_less_than_is_kept() {
    let body =
        format!(r#"{{"ISBN:{ISBN}": {{"title": "T", "notes": "se a < b allora <b>c</b> > d"}}}}"#);
    let m = parse(&body, ISBN).unwrap().unwrap();
    assert_eq!(m.description.as_deref(), Some("se a < b allora c > d"));
}

#[tokio::test]
async fn an_oversized_body_is_a_provider_error() {
    let body: &'static str =
        Box::leak(format!(r#"{{"pad":"{}"}}"#, "x".repeat(2 << 20)).into_boxed_str());
    let (base, _rx) = serve(200, body);
    let p = OpenLibrary::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}
