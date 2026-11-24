//! ISBN metadata lookup across external providers.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use utoipa::ToSchema;

pub mod annas;
pub mod google;
pub mod openlibrary;

pub use annas::AnnasArchive;
pub use google::GoogleBooks;
pub use openlibrary::OpenLibrary;

#[derive(Debug, Clone, Default, PartialEq, Serialize, ToSchema)]
pub struct Metadata {
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub authors: Vec<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i32>,
    pub page_count: Option<i32>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub genre: Option<String>,
    pub isbn_13: Option<String>,
    pub isbn_10: Option<String>,
    /// https URLs, most authoritative first.
    pub cover_candidates: Vec<String>,
    /// Providers that contributed at least one field.
    pub sources: Vec<String>,
}

/// Failure of a provider (network, unexpected format).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderError(pub String);

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ProviderError {}

#[async_trait::async_trait]
pub trait Provider: Send + Sync {
    /// "google-books" | "annas-archive" | "open-library"
    fn name(&self) -> &'static str;
    /// `Ok(None)` = no result. `Err` = provider failure.
    async fn lookup(&self, isbn_13: &str) -> Result<Option<Metadata>, ProviderError>;
}

const PROVIDER_TIMEOUT: Duration = Duration::from_secs(8);
const POSITIVE_TTL: i64 = 30 * 24 * 3600;
const NEGATIVE_TTL: i64 = 24 * 3600;
const MAX_CACHE: usize = 5_000;

struct CacheEntry {
    value: Option<Metadata>,
    expires_at: i64,
    stored_at: i64,
    seq: u64,
}

#[derive(Default)]
struct Cache {
    map: HashMap<String, CacheEntry>,
    seq: u64,
}

pub struct LookupService {
    providers: Vec<Arc<dyn Provider>>,
    cache: Mutex<Cache>,
    timeout: Duration,
}

impl LookupService {
    /// Google Books, Anna's Archive, Open Library, in this order.
    pub fn new(http: reqwest::Client) -> Self {
        Self::with_providers(vec![
            Arc::new(GoogleBooks::new(http.clone())),
            Arc::new(AnnasArchive::new(http.clone())),
            Arc::new(OpenLibrary::new(http)),
        ])
    }

    pub fn with_providers(providers: Vec<Arc<dyn Provider>>) -> Self {
        Self {
            providers,
            cache: Mutex::new(Cache::default()),
            timeout: PROVIDER_TIMEOUT,
        }
    }

    /// Overrides the per-provider time limit (8 s by default).
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn provider_names(&self) -> Vec<&'static str> {
        self.providers.iter().map(|p| p.name()).collect()
    }

    /// Number of cached ISBNs (positive and negative).
    pub fn cache_len(&self) -> usize {
        self.cache.lock().map(|c| c.map.len()).unwrap_or(0)
    }

    /// Merged metadata for the ISBN.
    pub async fn lookup(&self, isbn_13: &str, fresh: bool, now: i64) -> Option<Metadata> {
        if !fresh {
            if let Ok(cache) = self.cache.lock() {
                if let Some(e) = cache.map.get(isbn_13) {
                    if e.expires_at > now {
                        return e.value.clone();
                    }
                }
            }
        }

        let mut tasks = Vec::with_capacity(self.providers.len());
        for p in &self.providers {
            let p = Arc::clone(p);
            let isbn = isbn_13.to_string();
            let limit = self.timeout;
            tasks.push(tokio::spawn(async move {
                match tokio::time::timeout(limit, p.lookup(&isbn)).await {
                    Ok(Ok(r)) => Ok(r),
                    Ok(Err(e)) => {
                        tracing::debug!(provider = p.name(), error = %e, "lookup failed");
                        Err(())
                    }
                    Err(_) => {
                        tracing::debug!(provider = p.name(), "lookup timed out");
                        Err(())
                    }
                }
            }));
        }
        let mut results: Vec<(&'static str, Metadata)> = Vec::new();
        let mut any_ok = false;
        for (p, t) in self.providers.iter().zip(tasks) {
            if let Ok(Ok(r)) = t.await {
                any_ok = true;
                if let Some(m) = r {
                    results.push((p.name(), m));
                }
            }
        }

        let merged = merge(isbn_13, results);
        if merged.is_some() {
            self.store(isbn_13, merged.clone(), now, POSITIVE_TTL);
        } else if any_ok || self.providers.is_empty() {
            self.store(isbn_13, None, now, NEGATIVE_TTL);
        }
        merged
    }

    fn store(&self, isbn: &str, value: Option<Metadata>, now: i64, ttl: i64) {
        let Ok(mut c) = self.cache.lock() else { return };
        if !c.map.contains_key(isbn) && c.map.len() >= MAX_CACHE {
            c.map.retain(|_, e| e.expires_at > now);
            while c.map.len() >= MAX_CACHE {
                let oldest = c
                    .map
                    .iter()
                    .min_by_key(|(_, e)| (e.stored_at, e.seq))
                    .map(|(k, _)| k.clone());
                match oldest {
                    Some(k) => c.map.remove(&k),
                    None => break,
                };
            }
        }
        c.seq += 1;
        let seq = c.seq;
        c.map.insert(
            isbn.to_string(),
            CacheEntry {
                value,
                expires_at: now + ttl,
                stored_at: now,
                seq,
            },
        );
    }
}

fn nonempty(s: &Option<String>) -> bool {
    s.as_deref().is_some_and(|v| !v.trim().is_empty())
}

fn isbn10_from_13(isbn13: &str) -> Option<String> {
    if isbn13.len() != 13
        || !isbn13.starts_with("978")
        || !isbn13.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let body = &isbn13[3..12];
    let sum: u32 = body
        .bytes()
        .enumerate()
        .map(|(i, b)| u32::from(b - b'0') * (10 - i as u32))
        .sum();
    let check = (11 - sum % 11) % 11;
    let c = if check == 10 {
        'X'
    } else {
        char::from_digit(check, 10)?
    };
    Some(format!("{body}{c}"))
}

/// `results` are in provider order.
fn merge(isbn_13: &str, results: Vec<(&'static str, Metadata)>) -> Option<Metadata> {
    let mut out = Metadata::default();
    let mut sources = Vec::new();
    for (name, m) in results {
        let mut contributed = false;
        macro_rules! scalar {
            ($f:ident) => {
                if out.$f.is_none() && nonempty(&m.$f) {
                    out.$f = m.$f.clone();
                    contributed = true;
                }
            };
        }
        scalar!(title);
        scalar!(subtitle);
        scalar!(publisher);
        scalar!(language);
        scalar!(description);
        scalar!(genre);
        scalar!(isbn_10);
        if out.published_year.is_none() && m.published_year.is_some_and(|v| v != 0) {
            out.published_year = m.published_year;
            contributed = true;
        }
        if out.page_count.is_none() && m.page_count.is_some_and(|v| v != 0) {
            out.page_count = m.page_count;
            contributed = true;
        }
        if out.authors.is_empty() && m.authors.iter().any(|a| !a.trim().is_empty()) {
            out.authors = m.authors.clone();
            contributed = true;
        }
        for url in &m.cover_candidates {
            if url.starts_with("https://") && !out.cover_candidates.contains(url) {
                out.cover_candidates.push(url.clone());
                contributed = true;
            }
        }
        if contributed {
            sources.push(name.to_string());
        }
    }
    out.title.as_ref()?;
    out.isbn_13 = Some(isbn_13.to_string());
    if out.isbn_10.is_none() {
        out.isbn_10 = isbn10_from_13(isbn_13);
    }
    out.sources = sources;
    Some(out)
}
