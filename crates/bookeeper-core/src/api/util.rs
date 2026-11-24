use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use serde::{de::DeserializeOwned, Deserialize};

use crate::error::{ApiError, ApiResult};

pub fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

/// New UUID v7 as a string.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

/// Like `axum::extract::Query`, but every rejection becomes 422 `validation`.
pub struct ApiQuery<T>(pub T);

impl<S, T> FromRequestParts<S> for ApiQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, ApiError> {
        match Query::<T>::from_request_parts(parts, state).await {
            Ok(Query(v)) => Ok(ApiQuery(v)),
            Err(_) => Err(ApiError::validation("Invalid query parameters")),
        }
    }
}

/// Pagination parameters.
#[derive(Debug, Clone, Deserialize)]
pub struct Page {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl Page {
    /// `(limit, offset)`: limit 1..=200 (default 50), offset >= 0.
    pub fn resolve(&self) -> ApiResult<(i64, i64)> {
        let limit = self.limit.unwrap_or(50);
        let offset = self.offset.unwrap_or(0);
        if !(1..=200).contains(&limit) {
            return Err(ApiError::validation("limit must be between 1 and 200"));
        }
        if offset < 0 {
            return Err(ApiError::validation("offset must be >= 0"));
        }
        Ok((limit, offset))
    }
}

fn clean(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_ascii_uppercase()
}

/// Validates the check digit; returns the ISBN-13 without spaces or hyphens.
pub fn normalize_isbn13(raw: &str) -> Option<String> {
    let s = clean(raw);
    if s.len() != 13 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let sum: u32 = s
        .bytes()
        .enumerate()
        .map(|(i, b)| u32::from(b - b'0') * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    sum.is_multiple_of(10).then_some(s)
}

/// Validates the check digit; returns the ISBN-10 without spaces or hyphens, uppercase.
pub fn normalize_isbn10(raw: &str) -> Option<String> {
    let s = clean(raw);
    if s.len() != 10 {
        return None;
    }
    let mut sum = 0u32;
    for (i, b) in s.bytes().enumerate() {
        let v = match b {
            b'0'..=b'9' => u32::from(b - b'0'),
            b'X' if i == 9 => 10,
            _ => return None,
        };
        sum += v * (10 - i as u32);
    }
    sum.is_multiple_of(11).then_some(s)
}
