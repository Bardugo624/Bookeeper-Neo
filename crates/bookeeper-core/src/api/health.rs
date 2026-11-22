use axum::{extract::State, Json};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct Health {
    status: &'static str,
    version: &'static str,
    time: String,
}

pub async fn health(State(s): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok",
        version: s.version,
        time: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    })
}
