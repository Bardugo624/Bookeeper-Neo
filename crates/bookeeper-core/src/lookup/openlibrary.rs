//! open-library provider (stub).

use super::{Metadata, Provider, ProviderError};

pub struct OpenLibrary {
    #[allow(dead_code)]
    http: reqwest::Client,
}

impl OpenLibrary {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait::async_trait]
impl Provider for OpenLibrary {
    fn name(&self) -> &'static str {
        "open-library"
    }

    async fn lookup(&self, _isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        Ok(None)
    }
}
