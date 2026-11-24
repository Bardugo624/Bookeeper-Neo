use crate::state::AppState;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
}

#[derive(utoipa::OpenApi)]
#[openapi()]
pub struct Doc;
