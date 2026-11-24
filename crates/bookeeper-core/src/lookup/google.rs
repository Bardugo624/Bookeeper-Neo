//! google-books provider (stub).

use super::{Metadata, Provider, ProviderError};

pub struct GoogleBooks {
    #[allow(dead_code)]
    http: reqwest::Client,
}

impl GoogleBooks {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait::async_trait]
impl Provider for GoogleBooks {
    fn name(&self) -> &'static str {
        "google-books"
    }

    async fn lookup(&self, _isbn_13: &str) -> Result<Option<Metadata>, ProviderError> {
        Ok(None)
    }
}
