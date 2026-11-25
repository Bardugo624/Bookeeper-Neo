use axum::{extract::State, Json};
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct Health {
    status: &'static str,
    version: &'static str,
    time: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/health",
    tag = "system",
    responses((status = 200, description = "Service is up", body = Health))
)]
pub async fn health(State(s): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok",
        version: s.version,
        time: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    })
}
