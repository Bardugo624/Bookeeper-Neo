//! Anna's Archive provider (read-only, bibliographic metadata only).
//!
//! Port of the 0.3 Go provider (`server/internal/annas/annas.go`): the public
//! `/isbn/<isbn>` page of a list of mirror domains is fetched and the
//! `og:*` / `twitter:image` meta tags plus a few text patterns are read.
//! Only metadata and the cover URL are extracted: no download link is ever
//! read or stored.

use std::time::Duration;

use scraper::{ElementRef, Html, Node, Selector};

use super::{Metadata, Provider, ProviderError};

const NAME: &str = "annas-archive";

/// Mirrors tried in order (same list as the Go provider).
const MIRRORS: [&str; 4] = [
    "https://annas-archive.org",
    "https://annas-archive.gl",
    "https://annas-archive.li",
    "https://annas-archive.se",
];

/// Budget for a single domain.
const PER_MIRROR_TIMEOUT: Duration = Duration::from_secs(6);
/// Overall budget (the service grants 8 s to a provider).
const TOTAL_TIMEOUT: Duration = Duration::from_secs(7);
/// Pages are ~80–250 KiB; never read more than 1 MiB.
const MAX_BODY: usize = 1 << 20;

pub struct AnnasArchive {
    http: reqwest::Client,
    mirrors: Vec<String>,
}

impl AnnasArchive {
    pub fn new(http: reqwest::Client) -> Self {
        Self::with_mirrors(http, MIRRORS.iter().map(|m| m.to_string()).collect())
    }

    /// For tests: the whole list is replaced by a single base address.
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self {
        Self::with_mirrors(http, vec![base_url.to_string()])
    }

    /// For tests: custom ordered list of mirrors.
    pub fn with_mirrors(http: reqwest::Client, mirrors: Vec<String>) -> Self {
        let mirrors = mirrors.into_iter().map(|m| m.trim_end_matches('/').to_string()).collect();
        Self { http, mirrors }
    }

    fn allowed_host(&self, host: &str) -> bool {
        self.mirrors
            .iter()
            .filter_map(|m| reqwest::Url::parse(m).ok())
            .any(|u| u.host_str().is_some_and(|h| h.eq_ignore_ascii_case(host)))
    }

    /// One mirror. `Ok(Some(body))` = 200, `Ok(None)` = 404, `Err` = try the next.
    async fn fetch(&self, mirror: &str, isbn: &str) -> Result<Option<String>, ProviderError> {
        let url = format!("{mirror}/isbn/{isbn}");
        let mut resp = self
            .http
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "it,en;q=0.9")
            .send()
            .await
            .map_err(|e| ProviderError(format!("annas-archive: request failed: {e}")))?;
        // The shared client may follow redirects: refuse the ones that left the list.
        let host_ok = resp.url().host_str().is_some_and(|h| self.allowed_host(h));
        if !host_ok {
            return Err(ProviderError("annas-archive: redirect outside the mirror list".into()));
        }
        let status = resp.status().as_u16();
        if status == 404 {
            return Ok(None);
        }
        if status != 200 {
            return Err(ProviderError(format!("annas-archive: status {status}")));
        }
        let mut buf: Vec<u8> = Vec::new();
        let mut truncated = false;
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| ProviderError(format!("annas-archive: read body: {e}")))?
        {
            buf.extend_from_slice(&chunk);
            if buf.len() > MAX_BODY {
                buf.truncate(MAX_BODY);
                truncated = true;
                break;
            }
        }
        let body = if truncated {
            String::from_utf8_lossy(&buf).into_owned()
        } else {
            String::from_utf8(buf)
                .map_err(|_| ProviderError("annas-archive: body is not valid UTF-8".into()))?
        };
        Ok(Some(body))
    }

    async fn lookup_all(&self, isbn: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        let mut last_err = None;
        for mirror in &self.mirrors {
            let attempt = tokio::time::timeout(PER_MIRROR_TIMEOUT, self.fetch(mirror, isbn)).await;
            match attempt {
                Ok(Ok(Some(body))) => match parse(&body, isbn_13) {
                    Ok(None) if !is_no_records(&body) => {
                        // Unparseable 200 (parked domain, challenge page): next mirror.
                        last_err = Some(ProviderError("annas-archive: parse failed".into()));
                    }
                    other => return other,
                },
                Ok(Ok(None)) => return Ok(None),
                Ok(Err(e)) => last_err = Some(e),
                Err(_) => last_err = Some(ProviderError("annas-archive: mirror timed out".into())),
            }
        }
        Err(last_err.unwrap_or_else(|| ProviderError("annas-archive: no mirror configured".into())))
    }
}

#[async_trait::async_trait]
impl Provider for AnnasArchive {
    fn name(&self) -> &'static str {
        NAME
    }

    async fn lookup(&self, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        let isbn = normalize_isbn(isbn_13);
        if isbn.len() != 10 && isbn.len() != 13 {
            return Ok(None);
        }
        match tokio::time::timeout(TOTAL_TIMEOUT, self.lookup_all(&isbn, isbn_13)).await {
            Ok(r) => r,
            Err(_) => Err(ProviderError("annas-archive: overall timeout".into())),
        }
    }
}

fn normalize_isbn(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_digit() || *c == 'X' || *c == 'x')
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

fn clean(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

fn is_no_records(body: &str) -> bool {
    body.contains("no records") || body.contains("Nessun risultato")
}

/// Pure: response body to result. No network access.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
    if is_no_records(body) {
        return Ok(None);
    }
    let isbn = normalize_isbn(isbn_13);
    let doc = Html::parse_document(body);

    let title = meta(&doc, "property", "og:title").and_then(|s| clean(&s));
    let raw_desc = meta(&doc, "property", "og:description").unwrap_or_default();
    let desc_text = plain_text(&raw_desc);
    let cover = meta(&doc, "property", "og:image")
        .or_else(|| meta(&doc, "name", "twitter:image"))
        .and_then(|s| https_url(&s));

    // Without title and cover the page is unusable.
    if title.is_none() && cover.is_none() {
        return Ok(None);
    }

    let text = page_text(&doc);
    let mut m = Metadata { title, ..Default::default() };
    if let Some(c) = cover {
        m.cover_candidates.push(c);
    }
    m.description = clean(&desc_text);
    if let Some(d) = m.description.clone() {
        populate_from_description(&mut m, &d);
    }
    m.language = find_language(&text);
    if let Some(n) = find_pages(&text) {
        m.page_count = Some(n);
    }

    // ISBNs: the requested one wins; the page fills what is missing.
    let tokens: Vec<&str> =
        text.split(|c: char| !c.is_ascii_alphanumeric()).filter(|t| !t.is_empty()).collect();
    let body_13 = tokens.iter().find(|t| is_isbn13(t)).map(|t| t.to_string());
    let body_10 = tokens.iter().find(|t| is_isbn10(t)).map(|t| t.to_ascii_uppercase());
    m.isbn_13 = if isbn.len() == 13 { Some(isbn.clone()) } else { body_13 };
    m.isbn_10 = if isbn.len() == 10 { Some(isbn.clone()) } else { body_10 };
    if m.isbn_10 == m.isbn_13 {
        m.isbn_10 = None;
    }
    m.sources = vec![NAME.to_string()];
    Ok(Some(m))
}

fn is_isbn13(t: &str) -> bool {
    t.len() == 13 && t.bytes().all(|b| b.is_ascii_digit()) && (t.starts_with("978") || t.starts_with("979"))
}

fn is_isbn10(t: &str) -> bool {
    let b = t.as_bytes();
    b.len() == 10
        && b[..9].iter().all(u8::is_ascii_digit)
        && (b[9].is_ascii_digit() || b[9] == b'X' || b[9] == b'x')
}

fn meta(doc: &Html, attr: &str, value: &str) -> Option<String> {
    let sel = Selector::parse(&format!("meta[{attr}=\"{value}\"]")).ok()?;
    doc.select(&sel)
        .filter_map(|e| e.value().attr("content"))
        .map(str::trim)
        .find(|c| !c.is_empty())
        .map(str::to_string)
}

/// Only https is kept; `http://` is upgraded; anything else is dropped.
fn https_url(s: &str) -> Option<String> {
    let t = s.trim();
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("https://") && t.len() > 8 {
        Some(t.to_string())
    } else if lower.starts_with("http://") && t.len() > 7 {
        Some(format!("https://{}", &t[7..]))
    } else {
        None
    }
}

/// HTML fragment to plain text (tags removed, entities decoded).
fn plain_text(s: &str) -> String {
    if !s.contains('<') && !s.contains('&') {
        return s.to_string();
    }
    let frag = Html::parse_fragment(s);
    frag.root_element().text().collect::<String>()
}

/// Visible text of the document (script and style excluded).
fn page_text(doc: &Html) -> String {
    let mut out = String::new();
    for node in doc.tree.nodes() {
        if let Node::Text(t) = node.value() {
            let hidden = node
                .parent()
                .and_then(ElementRef::wrap)
                .is_some_and(|p| matches!(p.value().name(), "script" | "style" | "noscript"));
            if !hidden {
                out.push_str(t);
                out.push(' ');
            }
        }
    }
    out
}

/// Maximal ASCII digit runs of exactly four digits, as numbers.
fn four_digit_numbers(s: &str) -> impl Iterator<Item = i32> + '_ {
    s.split(|c: char| !c.is_ascii_digit())
        .filter(|r| r.len() == 4)
        .filter_map(|r| r.parse::<i32>().ok())
}

fn find_year(s: &str) -> Option<i32> {
    four_digit_numbers(s).find(|n| (1000..=2100).contains(n))
}

/// `(\d+)\s*pages?\b`, first match, 1..20000.
fn find_pages(s: &str) -> Option<i32> {
    let lower = s.to_ascii_lowercase();
    let b = lower.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if !b[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let digits = &lower[start..i];
        let mut j = i;
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        if lower[j..].starts_with("page") {
            let mut k = j + 4;
            if b.get(k) == Some(&b's') {
                k += 1;
            }
            let boundary = b.get(k).is_none_or(|c| !(c.is_ascii_alphanumeric() || *c == b'_'));
            if boundary {
                if let Ok(n) = digits.parse::<i32>() {
                    if n > 0 && n < 20000 {
                        return Some(n);
                    }
                }
            }
        }
    }
    None
}

/// `\b(language|lingua)\s*[:\-]?\s*([a-z]{2,3})\b`, first match.
fn find_language(s: &str) -> Option<String> {
    let lower = s.to_ascii_lowercase();
    let b = lower.as_bytes();
    let mut best: Option<(usize, String)> = None;
    for key in ["language", "lingua"] {
        let mut from = 0;
        while let Some(pos) = lower[from..].find(key) {
            let start = from + pos;
            from = start + key.len();
            if start > 0 && (b[start - 1].is_ascii_alphanumeric() || b[start - 1] == b'_') {
                continue;
            }
            let mut j = from;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && (b[j] == b':' || b[j] == b'-') {
                j += 1;
            }
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            let run_start = j;
            while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == b'_') {
                j += 1;
            }
            let run = &lower[run_start..j];
            if (2..=3).contains(&run.len()) && run.bytes().all(|c| c.is_ascii_lowercase()) {
                if best.as_ref().is_none_or(|(p, _)| start < *p) {
                    best = Some((start, run.to_string()));
                }
                break;
            }
        }
    }
    best.map(|(_, v)| v)
}

fn split_on_any<'a>(s: &'a str, seps: &[&str]) -> Vec<&'a str> {
    for sep in seps {
        if s.contains(sep) {
            return s.split(sep).collect();
        }
    }
    vec![s]
}

/// Publisher / year / pages / authors from `og:description`, conservative.
fn populate_from_description(m: &mut Metadata, desc: &str) {
    if let Some(y) = find_year(desc) {
        m.published_year = Some(y);
    }
    if m.page_count.is_none() {
        m.page_count = find_pages(desc);
    }
    for raw in split_on_any(desc, &[" — ", " – ", " - "]) {
        let seg = raw.trim();
        if seg.is_empty() {
            continue;
        }
        if let Some(i) = seg.find('(') {
            if i > 0 && i + 5 < seg.len() && find_year(&seg[i..]).is_some() && m.publisher.is_none() {
                m.publisher = clean(&seg[..i]);
                continue;
            }
        }
        if m.authors.is_empty() && (seg.contains(';') || seg.contains(" by ")) {
            let seg = seg.strip_prefix("by ").unwrap_or(seg);
            let authors: Vec<String> = split_on_any(seg, &[";", ","])
                .into_iter()
                .map(str::trim)
                .filter(|c| {
                    let n = c.chars().count();
                    (3..=80).contains(&n) && !c.chars().any(|ch| ch.is_ascii_digit())
                })
                .map(str::to_string)
                .collect();
            if !authors.is_empty() && authors.len() <= 8 {
                m.authors = authors;
            }
        }
    }
}
