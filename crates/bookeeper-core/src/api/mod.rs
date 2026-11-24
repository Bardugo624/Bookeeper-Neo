use axum::{routing::get, Json, Router};

use crate::{error::ApiError, state::AppState};

pub mod auth;
pub mod backup;
pub mod books;
pub mod books_search;
pub mod confirm;
pub mod covers;
pub mod devices;
pub mod health;
pub mod labels;
pub mod loans;
pub mod lookup;
pub mod pairing;
pub mod server;
pub mod setup;
pub mod shelves;
pub mod stats;
pub mod transfer;
pub mod util;
pub mod wishlist;

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
        .route("/api/v1/server", get(server::server_info))
        .merge(setup::routes())
        .merge(auth::routes())
        .merge(pairing::routes())
        .merge(devices::routes())
        .merge(books::routes())
        .merge(books_search::routes())
        .merge(shelves::routes())
        .merge(loans::routes())
        .merge(wishlist::routes())
        .merge(stats::routes())
        .merge(lookup::routes())
        .merge(covers::routes())
        .merge(transfer::routes())
        .merge(confirm::routes())
        .merge(backup::routes())
        .merge(labels::routes())
        .route("/api/v1/openapi.json", get(openapi_json))
        .fallback(fallback)
        .method_not_allowed_fallback(method_not_allowed_fallback)
        .with_state(state)
}
