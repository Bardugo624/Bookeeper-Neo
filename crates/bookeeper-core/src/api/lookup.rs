use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json,
};
use serde::Deserialize;

use crate::{
    api::util::{normalize_isbn10, normalize_isbn13, now_secs},
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

fn to_isbn13(raw: &str) -> Option<String> {
    if let Some(v) = normalize_isbn13(raw) {
        return Some(v);
    }
    let ten = normalize_isbn10(raw)?;
    let body = format!("978{}", &ten[..9]);
    let sum: u32 = body
        .bytes()
        .enumerate()
        .map(|(i, b)| u32::from(b - b'0') * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    Some(format!("{body}{}", (10 - sum % 10) % 10))
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
        (status = 401, description = "Missing or invalid token", body = ApiErrorBody),
        (status = 404, description = "No provider knows the ISBN (isbn_not_found)", body = ApiErrorBody),
        (status = 422, description = "Invalid ISBN", body = ApiErrorBody),
    )
)]
pub async fn lookup_isbn(
    State(state): State<AppState>,
    _who: AuthUser,
    Path(isbn): Path<String>,
    Query(q): Query<LookupQuery>,
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
