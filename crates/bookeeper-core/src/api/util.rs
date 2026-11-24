use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
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

/// 200 response with the bytes, the given Content-Type and
/// `Content-Disposition: attachment; filename="<name>"`.
/// The name keeps only ASCII letters, digits, `-`, `_` and `.`; anything else becomes `_`.
pub fn download(bytes: Vec<u8>, content_type: &'static str, filename: &str) -> Response {
    let name: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            ),
        ],
        bytes,
    )
        .into_response()
}

/// Reads the whole body up to `max_bytes`. Larger bodies give 413 `payload_too_large`;
/// any other read failure gives 400 `bad_request`.
pub async fn read_body(body: axum::body::Body, max_bytes: usize) -> ApiResult<Vec<u8>> {
    match axum::body::to_bytes(body, max_bytes).await {
        Ok(b) => Ok(b.to_vec()),
        Err(e) => {
            let mut cur: Option<&(dyn std::error::Error + 'static)> = Some(&e);
            while let Some(err) = cur {
                if err.is::<http_body_util::LengthLimitError>() {
                    return Err(ApiError::coded(
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "payload_too_large",
                        "Request body is too large",
                    ));
                }
                cur = err.source();
            }
            Err(ApiError::coded(
                StatusCode::BAD_REQUEST,
                "bad_request",
                "Could not read the request body",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_body_over_the_limit_is_413() {
        let err = read_body(axum::body::Body::from(vec![0u8; 100]), 10)
            .await
            .unwrap_err();
        assert_eq!(err.status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(err.code, "payload_too_large");
    }

    #[tokio::test]
    async fn a_broken_body_is_400() {
        let chunks: Vec<Result<Vec<u8>, std::io::Error>> = vec![
            Ok(b"abc".to_vec()),
            Err(std::io::Error::other("connection reset")),
        ];
        let body = axum::body::Body::from_stream(futures_util::stream::iter(chunks));
        let err = read_body(body, 1000).await.unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
        assert_eq!(err.code, "bad_request");
    }
}
