//! Google Books provider: parser on fixtures, HTTP against a local server.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;

use bookeeper_core::lookup::google::parse;
use bookeeper_core::lookup::{GoogleBooks, Provider};

const ISBN: &str = "9788845292613";

fn fixture(name: &str) -> String {
    let p = format!(
        "{}/tests/fixtures/google/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read_to_string(p).unwrap()
}

/// One-shot local server; returns its base URL and a receiver of the request line.
fn serve(status: &str, body: &str) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel();
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = tx.send(req.lines().next().unwrap_or("").to_string());
            let _ = s.write_all(response.as_bytes());
        }
    });
    (base, rx)
}

#[test]
fn parses_a_full_volume() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    assert_eq!(m.subtitle.as_deref(), Some("Edizione illustrata"));
    assert_eq!(m.authors, vec!["Umberto Eco", "Altro Autore"]);
    assert_eq!(m.publisher.as_deref(), Some("Bompiani"));
    assert_eq!(m.published_year, Some(1980));
    assert_eq!(m.page_count, Some(512));
    assert_eq!(m.language.as_deref(), Some("it"));
    assert_eq!(m.genre.as_deref(), Some("Fiction › Historical › Medieval"));
    assert_eq!(m.isbn_13.as_deref(), Some(ISBN));
    assert_eq!(m.isbn_10.as_deref(), Some("8845292614"));
    assert!(m.description.is_some());
    assert!(!m.cover_candidates.is_empty());
    assert_eq!(m.sources, vec!["google-books"]);
}

#[test]
fn picks_the_item_matching_the_isbn() {
    let m = parse(&fixture("two_items.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Right Book"));
    // No match: the first one.
    let m = parse(&fixture("two_items.json"), "9781111111111")
        .unwrap()
        .unwrap();
    assert_eq!(m.title.as_deref(), Some("Wrong Book"));
}

#[test]
fn zero_items_is_none() {
    assert_eq!(parse(&fixture("empty.json"), ISBN).unwrap(), None);
    assert_eq!(parse(r#"{"totalItems":1}"#, ISBN).unwrap(), None);
}

#[test]
fn year_is_extracted_from_partial_dates() {
    let year = |d: &str| {
        let body =
            format!(r#"{{"totalItems":1,"items":[{{"volumeInfo":{{"publishedDate":"{d}"}}}}]}}"#);
        parse(&body, ISBN).unwrap().unwrap().published_year
    };
    assert_eq!(year("1980"), Some(1980));
    assert_eq!(year("1980-05"), Some(1980));
    assert_eq!(year("1980-05-12"), Some(1980));
    assert_eq!(year("n.d."), None);
}

#[test]
fn cover_candidates_prefer_large_and_force_https() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    let c = &m.cover_candidates;
    assert!(c.iter().all(|u| u.starts_with("https://")));
    assert!(c.iter().all(|u| !u.contains("&edge=curl")));
    // large (zoom=3) comes first, its zoom=0 variant before it.
    assert!(c[0].contains("zoom=0"), "{c:?}");
    assert!(c[1].contains("zoom=3"), "{c:?}");
    let first_thumb = c.iter().position(|u| u.contains("zoom=1")).unwrap();
    assert!(first_thumb > 1);
    let mut dedup = c.clone();
    dedup.sort();
    dedup.dedup();
    assert_eq!(dedup.len(), c.len());
}

#[test]
fn category_becomes_a_breadcrumb() {
    let body = r#"{"totalItems":1,"items":[{"volumeInfo":{"categories":["Fiction / Thrillers / Crime","Other"]}}]}"#;
    let m = parse(body, ISBN).unwrap().unwrap();
    assert_eq!(m.genre.as_deref(), Some("Fiction › Thrillers › Crime"));
}

#[test]
fn html_in_description_is_stripped() {
    let m = parse(&fixture("full.json"), ISBN).unwrap().unwrap();
    let d = m.description.unwrap();
    assert!(!d.contains('<') && !d.contains("&amp;") && !d.contains("&quot;"));
    assert!(d.contains("Un giallo medievale & filosofico."));
    assert!(d.contains("\"paragrafo\""));
}

#[test]
fn missing_volume_info_fields_are_absent() {
    let m = parse(&fixture("sparse.json"), ISBN).unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Solo titolo"));
    assert_eq!(m.subtitle, None);
    assert!(m.authors.is_empty());
    assert_eq!(m.publisher, None);
    assert_eq!(m.page_count, None);
    assert_eq!(m.genre, None);
    assert!(m.cover_candidates.is_empty());
    assert_eq!(m.isbn_13, None);
    let m = parse(&fixture("no_volume_info.json"), ISBN)
        .unwrap()
        .unwrap();
    assert_eq!(m.title, None);
}

#[tokio::test]
async fn not_found_status_is_none() {
    let (base, _rx) = serve("404 Not Found", "{}");
    let p = GoogleBooks::with_base_url(reqwest::Client::new(), &base);
    assert_eq!(p.lookup(ISBN).await.unwrap(), None);
}

#[tokio::test]
async fn server_error_is_an_error() {
    let (base, _rx) = serve("503 Service Unavailable", "oops");
    let p = GoogleBooks::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
    let (base, _rx) = serve("429 Too Many Requests", "{}");
    let p = GoogleBooks::with_base_url(reqwest::Client::new(), &base);
    assert!(p.lookup(ISBN).await.is_err());
}

#[tokio::test]
async fn request_carries_the_isbn() {
    let (base, rx) = serve("200 OK", &fixture("full.json"));
    let p = GoogleBooks::with_base_url(reqwest::Client::new(), &base);
    assert_eq!(p.name(), "google-books");
    let m = p.lookup(ISBN).await.unwrap().unwrap();
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    let line = rx.recv().unwrap();
    assert!(line.starts_with("GET /books/v1/volumes?"), "{line}");
    assert!(line.contains(&format!("isbn:{ISBN}")), "{line}");
}

#[test]
fn malformed_body_is_an_error_not_a_panic() {
    assert!(parse("not json", ISBN).is_err());
    assert!(parse("", ISBN).is_err());
    assert!(parse("[1,2]", ISBN).is_err());
    assert!(parse(r#"{"totalItems":"x","items":[1,null,"s"]}"#, ISBN)
        .unwrap()
        .is_none());
}
