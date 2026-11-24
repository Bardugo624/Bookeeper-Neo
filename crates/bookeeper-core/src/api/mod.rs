use axum::{routing::get, Json, Router};

use crate::{error::ApiError, state::AppState};

pub mod auth;
pub mod devices;
pub mod health;
pub mod pairing;
pub mod setup;

async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(crate::openapi::openapi())
}

async fn fallback() -> ApiError {
    ApiError::not_found()
}

async fn method_not_allowed_fallback() -> ApiError {
    ApiError::method_not_allowed()
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(health::health))
        .merge(setup::routes())
        .merge(auth::routes())
        .merge(pairing::routes())
        .merge(devices::routes())
        .route("/api/v1/openapi.json", get(openapi_json))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed_fallback)
        .with_state(state)
}
