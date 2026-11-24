pub fn routes() -> axum::Router<crate::state::AppState> {
    axum::Router::new()
}

#[derive(utoipa::OpenApi)]
#[openapi()]
pub struct Doc;
