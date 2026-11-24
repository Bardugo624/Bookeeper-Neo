//! ISBN metadata lookup across external providers.

use std::sync::Arc;

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

pub struct LookupService {
    providers: Vec<Arc<dyn Provider>>,
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
        Self { providers }
    }

    pub fn provider_names(&self) -> Vec<&'static str> {
        self.providers.iter().map(|p| p.name()).collect()
    }

    /// Merged metadata for the ISBN. Stub: returns `None` until `lookup-core` lands.
    pub async fn lookup(&self, _isbn_13: &str, _fresh: bool, _now: i64) -> Option<Metadata> {
        None
    }
}
