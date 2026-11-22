use axum::{routing::get, Router};

use crate::state::AppState;

pub mod health;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(health::health))
        .with_state(state)
}
