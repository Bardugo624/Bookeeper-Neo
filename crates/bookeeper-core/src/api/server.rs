use axum::{extract::State, Json};
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::{AppState, TlsMode};

/// How clients can reach this server.
#[derive(Serialize, ToSchema)]
pub struct ServerOut {
    pub version: String,
    pub tls: TlsMode,
    /// Always present in the JSON; `null` when there is no public address.
    #[schema(required = true)]
    pub public_url: Option<String>,
    pub phone_ready: bool,
}

#[utoipa::path(
    get,
    path = "/api/v1/server",
    tag = "system",
    responses((status = 200, description = "Connection information", body = ServerOut))
)]
pub async fn server_info(State(s): State<AppState>) -> Json<ServerOut> {
    Json(ServerOut {
        version: s.version.to_string(),
        tls: s.server.tls,
        public_url: s.server.public_url.clone(),
        phone_ready: s.server.phone_ready(),
    })
}
