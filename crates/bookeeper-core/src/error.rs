use axum::{
    http::{header::RETRY_AFTER, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::db::DbError;

/// JSON body of every API error response.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ApiErrorBody {
    /// Stable, machine-readable `snake_case` code.
    pub error_code: String,
    /// Human-readable description.
    pub message: String,
}

/// Error returned by API handlers. Serialized as `{"error_code", "message"}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    /// Seconds for the `Retry-After` header, when set.
    pub retry_after: Option<u64>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> ApiError {
        ApiError {
            status,
            code,
            message: message.into(),
            retry_after: None,
        }
    }

    pub fn not_found() -> ApiError {
        Self::new(StatusCode::NOT_FOUND, "not_found", "Resource not found")
    }

    pub fn bad_request(msg: impl Into<String>) -> ApiError {
        Self::new(StatusCode::BAD_REQUEST, "bad_request", msg)
    }

    pub fn unauthorized() -> ApiError {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Authentication required",
        )
    }

    pub fn forbidden() -> ApiError {
        Self::new(StatusCode::FORBIDDEN, "forbidden", "Access denied")
    }

    pub fn conflict(code: &'static str, msg: impl Into<String>) -> ApiError {
        Self::new(StatusCode::CONFLICT, code, msg)
    }

    pub fn validation(msg: impl Into<String>) -> ApiError {
        Self::new(StatusCode::UNPROCESSABLE_ENTITY, "validation", msg)
    }

    pub fn coded(status: StatusCode, code: &'static str, msg: impl Into<String>) -> ApiError {
        Self::new(status, code, msg)
    }

    pub fn too_many_requests(retry_after_secs: u64) -> ApiError {
        ApiError {
            retry_after: Some(retry_after_secs),
            ..Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                "Too many attempts, retry later",
            )
        }
    }

    pub fn internal() -> ApiError {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Internal server error",
        )
    }

    pub(crate) fn method_not_allowed() -> ApiError {
        Self::new(
            StatusCode::METHOD_NOT_ALLOWED,
            "method_not_allowed",
            "Method not allowed",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ApiErrorBody {
            error_code: self.code.to_string(),
            message: self.message,
        };
        let mut res = (self.status, Json(body)).into_response();
        if let Some(secs) = self.retry_after {
            res.headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from(secs));
        }
        res
    }
}

impl From<DbError> for ApiError {
    fn from(err: DbError) -> ApiError {
        tracing::error!(error = %err, "database error");
        ApiError::internal()
    }
}
