//! Where a person stopped in an e-book file, and the one progress of the book.
//!
//! Last write wins: the server decides nothing else, the reader compares and asks.
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::{
        reading::{fetch_reading, ReadingOut},
        util::{new_id, now_secs},
    },
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

const MAX_VALUE: usize = 4_000;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route(
            "/api/v1/books/{id}/files/{file_id}/position",
            put(put_position),
        )
        .route("/api/v1/books/{id}/positions", get(list_positions))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(put_position, list_positions),
    components(schemas(PutPosition, PositionOut))
)]
pub struct Doc;

/// Body of `PUT /books/{id}/files/{file_id}/position`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PutPosition {
    /// Only `cfi` (the Bookeeper reader) can be written here.
    pub kind: String,
    /// The position in the format of the writer, at most 4000 characters.
    pub value: String,
    /// 0 to 100.
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PositionOut {
    pub file_id: String,
    /// `cfi`, `koreader` or `kobo`.
    pub kind: String,
    pub value: String,
    pub percent: Option<f64>,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    /// `desktop` or `mobile`; null when the device no longer exists.
    pub device_kind: Option<String>,
    pub updated_at: i64,
}

fn file_in_book(
    conn: &rusqlite::Connection,
    who: &AuthUser,
    book_id: &str,
    file_id: &str,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM book_files WHERE id = ?1 AND book_id = ?2 AND library_id = ?3)",
        params![file_id, book_id, who.library_id],
        |r| r.get(0),
    )
}

#[utoipa::path(
    put,
    path = "/api/v1/books/{id}/files/{file_id}/position",
    tag = "reading",
    security(("bearer" = [])),
    params(
        ("id" = String, Path, description = "Book id"),
        ("file_id" = String, Path, description = "File id"),
    ),
    request_body = PutPosition,
    responses(
        (status = 200, description = "The caller's reading state with the new progress; null when there is no reading yet and percent is 0", body = Option<ReadingOut>),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or file", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn put_position(
    State(state): State<AppState>,
    who: AuthUser,
    Path((id, file_id)): Path<(String, String)>,
    ApiJson(body): ApiJson<PutPosition>,
) -> ApiResult<Json<Option<ReadingOut>>> {
    who.require(Role::Member)?;
    if body.kind != "cfi" {
        return Err(ApiError::validation("kind must be cfi"));
    }
    if body.value.is_empty() || body.value.chars().count() > MAX_VALUE {
        return Err(ApiError::validation(format!(
            "value must be 1 to {MAX_VALUE} characters"
        )));
    }
    if !body.percent.is_finite() || !(0.0..=100.0).contains(&body.percent) {
        return Err(ApiError::validation("percent must be between 0 and 100"));
    }
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(page_count) = crate::api::reading::book_page_count(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            if !file_in_book(&tx, &who, &id, &file_id)? {
                return Ok(Err(ApiError::not_found()));
            }
            let now = now_secs();
            tx.execute(
                "INSERT INTO reading_positions (id, library_id, user_id, file_id, kind, value, \
                 percent, device_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
                 ON CONFLICT(user_id, file_id, kind) DO UPDATE SET value = excluded.value, \
                 percent = excluded.percent, device_id = excluded.device_id, \
                 updated_at = excluded.updated_at",
                params![
                    new_id(),
                    who.library_id,
                    who.user_id,
                    file_id,
                    body.kind,
                    body.value,
                    body.percent,
                    who.device_id,
                    now
                ],
            )?;
            let page = page_count.map(|c| (body.percent / 100.0 * c as f64).round() as i64);
            // Never touches the status of an existing reading: `read` is the person's call.
            let updated = tx.execute(
                "UPDATE reading SET progress_percent = ?1, progress_at = ?2, \
                 progress_device_id = ?3, current_page = COALESCE(?4, current_page), \
                 updated_at = ?2 WHERE user_id = ?5 AND book_id = ?6",
                params![body.percent, now, who.device_id, page, who.user_id, id],
            )?;
            if updated == 0 && body.percent > 0.0 {
                tx.execute(
                    "INSERT INTO reading (id, library_id, user_id, book_id, status, started_at, \
                     current_page, updated_at, progress_percent, progress_at, progress_device_id) \
                     VALUES (?1, ?2, ?3, ?4, 'reading', ?5, ?6, ?5, ?7, ?5, ?8)",
                    params![
                        new_id(),
                        who.library_id,
                        who.user_id,
                        id,
                        now,
                        page,
                        body.percent,
                        who.device_id
                    ],
                )?;
            }
            let out = fetch_reading(&tx, &who, &id)?;
            tx.commit()?;
            // With no reading and 0%, there is nothing to report yet: null.
            Ok(Ok(out))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/positions",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "The caller's positions in the book's files", body = Vec<PositionOut>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn list_positions(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<PositionOut>>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            if crate::api::reading::book_page_count(conn, &who, &id)?.is_none() {
                return Ok(Err(ApiError::not_found()));
            }
            let mut stmt = conn.prepare(
                "SELECT p.file_id, p.kind, p.value, p.percent, p.device_id, d.name, d.kind, p.updated_at \
                 FROM reading_positions p \
                 JOIN book_files f ON f.id = p.file_id \
                 LEFT JOIN devices d ON d.id = p.device_id \
                 WHERE p.user_id = ?1 AND p.library_id = ?2 AND f.book_id = ?3 \
                 ORDER BY p.updated_at DESC, p.id DESC",
            )?;
            let rows = stmt
                .query_map(params![who.user_id, who.library_id, id], |r| {
                    Ok(PositionOut {
                        file_id: r.get(0)?,
                        kind: r.get(1)?,
                        value: r.get(2)?,
                        percent: r.get(3)?,
                        device_id: r.get(4)?,
                        device_name: r.get(5)?,
                        device_kind: r.get(6)?,
                        updated_at: r.get(7)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(Ok(rows))
        })
        .await??;
    Ok(Json(out))
}
