use axum::{
    extract::{Path, State},
    routing::get,
    Json,
};
use serde::Deserialize;

use crate::{
    api::util::{now_secs, to_isbn13, ApiQuery},
    auth::guard::AuthUser,
    error::{ApiError, ApiErrorBody, ApiResult},
    lookup::Metadata,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/lookup/isbn/{isbn}", get(lookup_isbn))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(lookup_isbn), components(schemas(Metadata)))]
pub struct Doc;

#[derive(Debug, Deserialize)]
pub struct LookupQuery {
    #[serde(default)]
    fresh: Option<bool>,
}

/// Merged book metadata from external providers.
#[utoipa::path(
    get,
    path = "/api/v1/lookup/isbn/{isbn}",
    tag = "lookup",
    security(("bearer" = [])),
    params(
        ("isbn" = String, Path, description = "ISBN-13 or ISBN-10, hyphens allowed"),
        ("fresh" = Option<bool>, Query, description = "Skip the cache and refresh it"),
    ),
    responses(
        (status = 200, description = "Metadata", body = Metadata),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "isbn_not_found: no provider knows the ISBN", body = ApiErrorBody),
        (status = 422, description = "validation: invalid ISBN", body = ApiErrorBody),
    )
)]
pub async fn lookup_isbn(
    State(state): State<AppState>,
    _who: AuthUser,
    Path(isbn): Path<String>,
    ApiQuery(q): ApiQuery<LookupQuery>,
) -> ApiResult<Json<Metadata>> {
    let isbn13 = to_isbn13(&isbn).ok_or_else(|| ApiError::validation("Invalid ISBN"))?;
    state
        .lookup
        .lookup(&isbn13, q.fresh.unwrap_or(false), now_secs())
        .await
        .map(Json)
        .ok_or_else(|| {
            ApiError::coded(
                axum::http::StatusCode::NOT_FOUND,
                "isbn_not_found",
                "No provider knows this ISBN",
            )
        })
}
