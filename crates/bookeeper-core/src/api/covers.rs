//! Cover storage, upload and download.
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;

use crate::{
    api::util::{now_secs, read_body},
    audit,
    auth::{guard::AuthUser, Role},
    covers::{self, Processed},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route(
            "/api/v1/books/{id}/cover",
            get(get_cover).put(put_cover).delete(delete_cover),
        )
        .route(
            "/api/v1/books/{id}/cover/fetch",
            axum::routing::post(fetch_cover),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(get_cover, put_cover, fetch_cover, delete_cover),
    components(schemas(CoverColor, FetchCover, CoverFetched))
)]
pub struct Doc;

#[derive(Debug, Serialize, ToSchema)]
pub struct CoverColor {
    /// Dominant colour, `#rrggbb`.
    pub cover_color: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct FetchCover {
    /// 1 to 8 image URLs, tried in order.
    pub candidates: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CoverFetched {
    pub cover_color: String,
    pub source_url: String,
}

fn unsupported() -> ApiError {
    ApiError::coded(
        StatusCode::BAD_REQUEST,
        "unsupported_image",
        "The file is not a valid JPEG, PNG or WebP image",
    )
}

fn not_found_cover() -> ApiError {
    ApiError::coded(
        StatusCode::NOT_FOUND,
        "cover_not_found",
        "This book has no cover",
    )
}

/// Serialises cover mutations (file + row) so a `PUT` racing a `DELETE` cannot
/// leave the columns set while the file is gone, or the reverse.
static COVER_WRITES: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// The id as stored (server-generated) when the book belongs to the library.
async fn book_id(state: &AppState, who: &AuthUser, id: String) -> ApiResult<String> {
    let lib = who.library_id.clone();
    let found: Option<String> = state
        .db
        .run(move |conn| {
            conn.query_row(
                "SELECT id FROM books WHERE id = ?1 AND library_id = ?2",
                params![id, lib],
                |r| r.get(0),
            )
            .optional()
        })
        .await?;
    found.ok_or_else(ApiError::not_found)
}

/// Saves the processed cover on disk and in the book row. 404 when the book vanished.
async fn store(
    state: &AppState,
    who: AuthUser,
    id: String,
    p: Processed,
    detail: Option<serde_json::Value>,
) -> ApiResult<String> {
    let _guard = COVER_WRITES.lock().await;
    let dir = state.files.covers_dir.clone();
    let (bid, jpeg) = (id.clone(), p.jpeg);
    tokio::task::spawn_blocking(move || covers::write_atomic(&dir, &bid, &jpeg))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|e| {
            tracing::error!(error = %e, "cannot write cover");
            ApiError::internal()
        })?;
    let (bid, color, file) = (id.clone(), p.color.clone(), format!("{id}.jpg"));
    let updated = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let now = now_secs();
            let n = tx.execute(
                "UPDATE books SET cover_file = ?1, cover_color = ?2, updated_at = ?3 \
                 WHERE id = ?4 AND library_id = ?5",
                params![file, color, now, bid, who.library_id],
            )?;
            if n > 0 {
                audit::record(&tx, &who, "book.cover", "book", &bid, detail.as_ref(), now)?;
            }
            tx.commit()?;
            Ok(n > 0)
        })
        .await?;
    if !updated {
        covers::remove_files(&state.files.covers_dir, &[id]);
        return Err(ApiError::not_found());
    }
    Ok(p.color)
}

/// Upload a cover image (JPEG, PNG or WebP, at most 5 MB).
#[utoipa::path(
    put,
    path = "/api/v1/books/{id}/cover",
    tag = "covers",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body(content = Vec<u8>, content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Stored", body = CoverColor),
        (status = 400, description = "unsupported_image", body = ApiErrorBody),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
        (status = 413, description = "payload_too_large", body = ApiErrorBody),
    )
)]
pub async fn put_cover(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    body: Body,
) -> ApiResult<Json<CoverColor>> {
    who.require(Role::Member)?;
    let id = book_id(&state, &who, id).await?;
    let bytes = read_body(body, covers::MAX_BYTES).await?;
    let processed = tokio::task::spawn_blocking(move || covers::process(&bytes))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|_| unsupported())?;
    let cover_color = store(&state, who, id, processed, None).await?;
    Ok(Json(CoverColor { cover_color }))
}

/// Download a cover from the first usable candidate URL.
#[utoipa::path(
    post,
    path = "/api/v1/books/{id}/cover/fetch",
    tag = "covers",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = FetchCover,
    responses(
        (status = 200, description = "Stored", body = CoverFetched),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
        (status = 422, description = "validation or cover_fetch_failed", body = ApiErrorBody),
    )
)]
pub async fn fetch_cover(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<FetchCover>,
) -> ApiResult<Json<CoverFetched>> {
    who.require(Role::Member)?;
    if body.candidates.is_empty() || body.candidates.len() > 8 {
        return Err(ApiError::validation("candidates must hold 1 to 8 URLs"));
    }
    let id = book_id(&state, &who, id).await?;
    for url in &body.candidates {
        let Ok(bytes) = covers::fetch_guarded(&state, url).await else {
            continue;
        };
        let Ok(Ok(processed)) = tokio::task::spawn_blocking(move || covers::process(&bytes)).await
        else {
            continue;
        };
        let detail = serde_json::json!({ "source_url": url });
        let cover_color = store(&state, who.clone(), id, processed, Some(detail)).await?;
        return Ok(Json(CoverFetched {
            cover_color,
            source_url: url.clone(),
        }));
    }
    Err(ApiError::coded(
        StatusCode::UNPROCESSABLE_ENTITY,
        "cover_fetch_failed",
        "No candidate URL gave a valid image",
    ))
}

fn etag_of(bytes: &[u8]) -> String {
    format!("\"{}\"", hex::encode(&Sha256::digest(bytes)[..16]))
}

fn matches_etag(headers: &HeaderMap, etag: &str) -> bool {
    let Some(v) = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    else {
        return false;
    };
    v.split(',').any(|t| {
        let t = t.trim();
        t == "*" || t.strip_prefix("W/").unwrap_or(t) == etag
    })
}

/// The cover as `image/jpeg`.
#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/cover",
    tag = "covers",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "JPEG image", content_type = "image/jpeg", body = Vec<u8>),
        (status = 304, description = "Not modified"),
        (status = 404, description = "Unknown book or cover_not_found", body = ApiErrorBody),
    )
)]
pub async fn get_cover(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let id = book_id(&state, &who, id).await?;
    let bid = id.clone();
    let has_cover: Option<bool> = state
        .db
        .run(move |conn| {
            conn.query_row(
                "SELECT cover_file IS NOT NULL FROM books WHERE id = ?1",
                [&bid],
                |r| r.get(0),
            )
            .optional()
        })
        .await?;
    if has_cover != Some(true) {
        return Err(not_found_cover());
    }
    let path = covers::cover_path(&state.files.covers_dir, &id).ok_or_else(ApiError::internal)?;
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                not_found_cover()
            } else {
                ApiError::internal()
            }
        })?;
    let etag = etag_of(&bytes);
    let etag_value = HeaderValue::from_str(&etag).map_err(|_| ApiError::internal())?;
    let cache = HeaderValue::from_static("private, max-age=86400");
    if matches_etag(&headers, &etag) {
        return Ok((
            StatusCode::NOT_MODIFIED,
            [(header::ETAG, etag_value), (header::CACHE_CONTROL, cache)],
        )
            .into_response());
    }
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            (header::ETAG, etag_value),
            (header::CACHE_CONTROL, cache),
        ],
        bytes,
    )
        .into_response())
}

/// Remove the cover; 204 even when there was none.
#[utoipa::path(
    delete,
    path = "/api/v1/books/{id}/cover",
    tag = "covers",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 204, description = "No cover any more"),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
    )
)]
pub async fn delete_cover(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    let id = book_id(&state, &who, id).await?;
    let _guard = COVER_WRITES.lock().await;
    let bid = id.clone();
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let had: bool = tx
                .query_row(
                    "SELECT cover_file IS NOT NULL FROM books WHERE id = ?1 AND library_id = ?2",
                    params![bid, who.library_id],
                    |r| r.get(0),
                )
                .optional()?
                .unwrap_or(false);
            if had {
                let now = now_secs();
                tx.execute(
                    "UPDATE books SET cover_file = NULL, cover_color = NULL, updated_at = ?1 \
                     WHERE id = ?2",
                    params![now, bid],
                )?;
                audit::record(&tx, &who, "book.cover_delete", "book", &bid, None, now)?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?;
    let dir = state.files.covers_dir.clone();
    let _ = tokio::task::spawn_blocking(move || covers::remove_files(&dir, &[id])).await;
    Ok(StatusCode::NO_CONTENT)
}
