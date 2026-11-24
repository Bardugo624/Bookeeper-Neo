//! google-books provider: the public anonymous Volumes API.

use serde_json::Value;

use super::{Metadata, Provider, ProviderError};

const DEFAULT_BASE: &str = "https://www.googleapis.com";
const NAME: &str = "google-books";

pub struct GoogleBooks {
    http: reqwest::Client,
    base_url: String,
}

impl GoogleBooks {
    pub fn new(http: reqwest::Client) -> Self {
        Self::with_base_url(http, DEFAULT_BASE)
    }

    /// Same provider, different base address (tests).
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self {
        Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }
}

#[async_trait::async_trait]
impl Provider for GoogleBooks {
    fn name(&self) -> &'static str {
        NAME
    }

    async fn lookup(&self, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        let isbn: String = isbn_13
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect();
        let url = format!("{}/books/v1/volumes?q=isbn:{}", self.base_url, isbn);
        let resp = self
            .http
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| ProviderError(format!("google-books: request failed: {e}")))?;
        let status = resp.status();
        if status.as_u16() == 404 {
            return Ok(None);
        }
        if status.as_u16() == 429 || status.is_server_error() {
            return Err(ProviderError(format!(
                "google-books: status {}",
                status.as_u16()
            )));
        }
        if !status.is_success() {
            // Other 4xx: definitive "no record" from the provider's side.
            return Ok(None);
        }
        let body = resp
            .text()
            .await
            .map_err(|e| ProviderError(format!("google-books: read body: {e}")))?;
        parse(&body, isbn_13)
    }
}

/// Pure: response body to result. No network access.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
    let root: Value = serde_json::from_str(body)
        .map_err(|e| ProviderError(format!("google-books: malformed body: {e}")))?;
    if !root.is_object() {
        return Err(ProviderError("google-books: unexpected body shape".into()));
    }
    if root.get("totalItems").and_then(Value::as_i64) == Some(0) {
        return Ok(None);
    }
    let items: Vec<&Value> = match root.get("items").and_then(Value::as_array) {
        Some(a) => a.iter().filter(|i| i.is_object()).collect(),
        None => return Ok(None),
    };
    if items.is_empty() {
        return Ok(None);
    }
    let wanted = normalize_isbn(isbn_13);
    let item = items
        .iter()
        .find(|i| {
            identifiers(i)
                .iter()
                .any(|(_, id)| normalize_isbn(id) == wanted)
        })
        .unwrap_or(&items[0]);
    let empty = Value::Null;
    let v = item.get("volumeInfo").unwrap_or(&empty);

    let mut m = Metadata {
        title: str_field(v, "title"),
        subtitle: str_field(v, "subtitle"),
        authors: str_list(v, "authors"),
        publisher: str_field(v, "publisher"),
        published_year: str_field(v, "publishedDate").and_then(|d| parse_year(&d)),
        page_count: v
            .get("pageCount")
            .and_then(Value::as_i64)
            .filter(|n| *n > 0)
            .and_then(|n| i32::try_from(n).ok()),
        language: str_field(v, "language").map(|l| l.to_lowercase()),
        description: str_field(v, "description")
            .map(|d| strip_html(&d))
            .and_then(|d| clean(&d)),
        genre: str_list(v, "categories")
            .into_iter()
            .next()
            .map(|c| c.replace(" / ", " › ")),
        cover_candidates: cover_candidates(v.get("imageLinks")),
        sources: vec![NAME.to_string()],
        ..Metadata::default()
    };
    for (kind, id) in identifiers(item) {
        match kind.as_str() {
            "ISBN_13" if m.isbn_13.is_none() => m.isbn_13 = Some(id),
            "ISBN_10" if m.isbn_10.is_none() => m.isbn_10 = Some(id),
            _ => {}
        }
    }
    Ok(Some(m))
}

fn normalize_isbn(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

fn clean(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).and_then(clean)
}

fn str_list(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().and_then(clean))
                .collect()
        })
        .unwrap_or_default()
}

/// (type, identifier) pairs of an item's volumeInfo.
fn identifiers(item: &Value) -> Vec<(String, String)> {
    item.get("volumeInfo")
        .and_then(|v| v.get("industryIdentifiers"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let t = str_field(e, "type")?;
                    let id = str_field(e, "identifier")?;
                    Some((t, id))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// First four-digit number in 1000..=2100 found in the date.
fn parse_year(date: &str) -> Option<i32> {
    let b = date.as_bytes();
    (0..b.len().saturating_sub(3)).find_map(|i| {
        let w = &b[i..i + 4];
        if !w.iter().all(u8::is_ascii_digit) {
            return None;
        }
        let n = std::str::from_utf8(w).ok()?.parse::<i32>().ok()?;
        (1000..=2100).contains(&n).then_some(n)
    })
}

fn cover_candidates(links: Option<&Value>) -> Vec<String> {
    let Some(links) = links.filter(|l| l.is_object()) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    let mut push = |u: String| {
        if !out.contains(&u) {
            out.push(u);
        }
    };
    for key in [
        "extraLarge",
        "large",
        "medium",
        "small",
        "thumbnail",
        "smallThumbnail",
    ] {
        let Some(raw) = str_field(links, key) else {
            continue;
        };
        let base = raw
            .replacen("http://", "https://", 1)
            .replace("&edge=curl", "");
        if let Some(z) = with_zoom_zero(&base) {
            push(z);
        }
        push(base);
    }
    out
}

fn with_zoom_zero(u: &str) -> Option<String> {
    let idx = u.find("zoom=")?;
    let start = idx + "zoom=".len();
    let end = u[start..]
        .find(|c: char| !c.is_ascii_digit())
        .map_or(u.len(), |p| start + p);
    Some(format!("{}0{}", &u[..start], &u[end..]))
}

/// Plain text from an HTML fragment: tags removed, entities decoded.
fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '<' {
            let mut tag = String::new();
            let mut closed = false;
            for t in chars.by_ref() {
                if t == '>' {
                    closed = true;
                    break;
                }
                tag.push(t);
            }
            if !closed {
                out.push('<');
                out.push_str(&tag);
                break;
            }
            let name: String = tag
                .trim_start_matches('/')
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_lowercase();
            if matches!(name.as_str(), "br" | "p" | "div" | "li")
                && !out.ends_with(['\n', ' '])
                && !out.is_empty()
            {
                out.push('\n');
            }
        } else {
            out.push(c);
        }
    }
    decode_entities(&out)
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let decoded = rest.find(';').filter(|&e| e <= 10).and_then(|e| {
            let ent = &rest[1..e];
            let ch = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                _ => ent.strip_prefix('#').and_then(|n| {
                    let code = match n.strip_prefix(['x', 'X']) {
                        Some(h) => u32::from_str_radix(h, 16).ok()?,
                        None => n.parse::<u32>().ok()?,
                    };
                    char::from_u32(code)
                }),
            };
            ch.map(|c| (c, e + 1))
        });
        match decoded {
            Some((c, len)) => {
                out.push(c);
                rest = &rest[len..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}
