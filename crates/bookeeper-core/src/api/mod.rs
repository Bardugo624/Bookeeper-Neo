use axum::{routing::get, Router};

use crate::{error::ApiError, state::AppState};

pub mod health;

async fn fallback() -> ApiError {
    ApiError::not_found()
}

async fn method_not_allowed_fallback() -> ApiError {
    ApiError::method_not_allowed()
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(health::health))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed_fallback)
        .with_state(state)
}
