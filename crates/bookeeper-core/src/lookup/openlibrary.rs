//! open-library provider.
//!
//! Queries `{base}/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json` and adds the
//! canonical cover-by-ISBN URL as the last candidate.

use serde_json::Value;

use super::{Metadata, Provider, ProviderError};

const DEFAULT_BASE: &str = "https://openlibrary.org";

pub struct OpenLibrary {
    http: reqwest::Client,
    base_url: String,
}

impl OpenLibrary {
    pub fn new(http: reqwest::Client) -> Self {
        Self::with_base_url(http, DEFAULT_BASE)
    }

    /// Same provider, different base address (for tests).
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self {
        Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }
}

#[async_trait::async_trait]
impl Provider for OpenLibrary {
    fn name(&self) -> &'static str {
        "open-library"
    }

    async fn lookup(&self, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        let url = format!("{}/api/books", self.base_url);
        let bibkey = format!("ISBN:{isbn_13}");
        let resp = self
            .http
            .get(&url)
            .query(&[
                ("bibkeys", bibkey.as_str()),
                ("jscmd", "data"),
                ("format", "json"),
            ])
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| ProviderError(format!("open-library: request: {e}")))?;
        let status = resp.status();
        if status.as_u16() == 404 {
            return Ok(None);
        }
        if status.as_u16() == 429 || status.is_server_error() {
            return Err(ProviderError(format!("open-library: status {status}")));
        }
        if !status.is_success() {
            return Ok(None);
        }
        let body = resp
            .text()
            .await
            .map_err(|e| ProviderError(format!("open-library: read: {e}")))?;
        parse(&body, isbn_13)
    }
}

/// Pure: response body to result. No network access.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
    let root: Value = serde_json::from_str(body)
        .map_err(|e| ProviderError(format!("open-library: decode: {e}")))?;
    let Some(map) = root.as_object() else {
        return Err(ProviderError(
            "open-library: decode: expected a JSON object".into(),
        ));
    };
    let Some(rec) = map
        .get(&format!("ISBN:{isbn_13}"))
        .and_then(Value::as_object)
    else {
        return Ok(None);
    };
    let rec = Value::Object(rec.clone());

    let str_at = |v: &Value| v.as_str().and_then(clean);
    let first_name = |key: &str| {
        rec.get(key)
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(|o| o.get("name"))
            .and_then(str_at)
    };
    let first_id = |key: &str| {
        rec.get("identifiers")
            .and_then(|i| i.get(key))
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(str_at)
    };

    let authors = rec
        .get("authors")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|o| o.get("name").and_then(str_at))
                .collect()
        })
        .unwrap_or_default();

    let page_count = rec
        .get("number_of_pages")
        .and_then(Value::as_i64)
        .filter(|n| *n > 0)
        .and_then(|n| i32::try_from(n).ok());

    let description = rec
        .get("excerpts")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|e| e.get("text"))
        .and_then(Value::as_str)
        .and_then(plain_text)
        .or_else(|| {
            rec.get("notes")
                .and_then(Value::as_str)
                .and_then(plain_text)
        });

    let mut covers = Vec::new();
    for key in ["large", "medium"] {
        if let Some(u) = rec.get("cover").and_then(|c| c.get(key)).and_then(str_at) {
            covers.push(https(&u));
        }
    }
    covers.push(format!(
        "https://covers.openlibrary.org/b/isbn/{isbn_13}-L.jpg?default=false"
    ));

    Ok(Some(Metadata {
        title: rec.get("title").and_then(str_at),
        subtitle: rec.get("subtitle").and_then(str_at),
        authors,
        publisher: first_name("publishers"),
        published_year: rec
            .get("publish_date")
            .and_then(Value::as_str)
            .and_then(year),
        page_count,
        language: None,
        description,
        genre: first_name("subjects"),
        isbn_13: first_id("isbn_13"),
        isbn_10: first_id("isbn_10").map(|s| s.to_uppercase()),
        cover_candidates: covers,
        sources: vec!["open-library".to_string()],
    }))
}

fn clean(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

fn https(url: &str) -> String {
    match url.strip_prefix("http://") {
        Some(rest) => format!("https://{rest}"),
        None => url.to_string(),
    }
}

/// First run of exactly four digits with a value in 1000..=2100.
fn year(s: &str) -> Option<i32> {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i].is_ascii_digit() {
            let start = i;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if i - start == 4 {
                if let Ok(y) = s[start..i].parse::<i32>() {
                    if (1000..=2100).contains(&y) {
                        return Some(y);
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

/// Strip HTML tags, decode entities, trim; empty becomes `None`.
fn plain_text(s: &str) -> Option<String> {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in s.chars() {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let name = tag
                    .trim_start_matches('/')
                    .split(|c: char| c.is_whitespace() || c == '/')
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if matches!(name.as_str(), "br" | "p" | "div" | "li" | "ul" | "ol") {
                    out.push('\n');
                }
                tag.clear();
            } else {
                tag.push(c);
            }
        } else if c == '<' {
            in_tag = true;
        } else {
            out.push(c);
        }
    }
    if in_tag {
        // Unterminated tag: keep what looked like text.
        out.push('<');
        out.push_str(&tag);
    }
    clean(&decode_entities(&out))
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos + 1..];
        let decoded = tail.find(';').filter(|e| *e <= 10).and_then(|end| {
            let name = &tail[..end];
            let ch = match name {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                _ => name.strip_prefix('#').and_then(|n| {
                    let code = match n.strip_prefix(['x', 'X']) {
                        Some(h) => u32::from_str_radix(h, 16).ok()?,
                        None => n.parse().ok()?,
                    };
                    char::from_u32(code)
                }),
            };
            ch.map(|c| (c, end))
        });
        match decoded {
            Some((c, end)) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    out
}
