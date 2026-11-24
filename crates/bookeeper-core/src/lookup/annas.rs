//! annas-archive provider (stub).

use super::{Metadata, Provider, ProviderError};

pub struct AnnasArchive {
    #[allow(dead_code)]
    http: reqwest::Client,
}

impl AnnasArchive {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait::async_trait]
impl Provider for AnnasArchive {
    fn name(&self) -> &'static str {
        "annas-archive"
    }

    async fn lookup(&self, _isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        Ok(None)
    }
}
