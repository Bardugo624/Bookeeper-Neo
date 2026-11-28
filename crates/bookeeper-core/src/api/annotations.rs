//! Highlights, notes and bookmarks of a person in an e-book.
//!
//! The device decides the id; the newest `updated_at` wins. Deleting leaves a tombstone so
//! other devices learn about it through `since`.
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::now_secs,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

const MAX_CFI: usize = 4_000;
const MAX_TEXT: usize = 5_000;
const MAX_NOTE: usize = 10_000;
const MAX_CHAPTER: usize = 300;
const MAX_FUTURE_SECS: i64 = 300;
const COLORS: [&str; 4] = ["amber", "sage", "terracotta", "night"];

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/books/{id}/annotations", get(list_annotations))
        .route(
            "/api/v1/books/{id}/annotations/{annotation_id}",
            axum::routing::put(put_annotation),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_annotations, put_annotation),
    components(schemas(PutAnnotation, AnnotationOut))
)]
pub struct Doc;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AnnotationsQuery {
    /// Only the annotations changed after this time (deleted ones included).
    pub since: Option<i64>,
}

/// Body of `PUT /books/{id}/annotations/{annotation_id}`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PutAnnotation {
    /// A file attached to the book.
    pub file_sha256: String,
    /// `highlight` or `bookmark`.
    pub kind: String,
    /// At most 4000 characters.
    pub cfi: String,
    /// The highlighted text, at most 5000 characters.
    pub text: String,
    /// `amber`, `sage`, `terracotta` or `night`: required for a highlight, absent for a bookmark.
    pub color: Option<String>,
    /// At most 10000 characters.
    pub note: Option<String>,
    /// 0 to 100.
    pub percent: f64,
    /// At most 300 characters.
    pub chapter: Option<String>,
    pub created_at: i64,
    /// Not more than 5 minutes in the future.
    pub updated_at: i64,
    /// Writes a tombstone.
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnnotationOut {
    pub id: String,
    pub file_sha256: String,
    pub kind: String,
    pub cfi: String,
    pub text: String,
    pub color: Option<String>,
    pub note: Option<String>,
    pub percent: f64,
    pub chapter: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

const COLS: &str = "id, file_sha256, kind, cfi, text, color, note, percent, chapter, \
                    created_at, updated_at, deleted_at";

fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<AnnotationOut> {
    Ok(AnnotationOut {
        id: r.get(0)?,
        file_sha256: r.get(1)?,
        kind: r.get(2)?,
        cfi: r.get(3)?,
        text: r.get(4)?,
        color: r.get(5)?,
        note: r.get(6)?,
        percent: r.get(7)?,
        chapter: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        deleted_at: r.get(11)?,
    })
}

fn book_exists(
    conn: &rusqlite::Connection,
    who: &AuthUser,
    book_id: &str,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM books WHERE id = ?1 AND library_id = ?2)",
        params![book_id, who.library_id],
        |r| r.get(0),
    )
}

fn too_long(s: &str, max: usize) -> bool {
    s.chars().count() > max
}

fn validate(body: &PutAnnotation, now: i64) -> Result<(), ApiError> {
    match (body.kind.as_str(), body.color.as_deref()) {
        ("highlight", Some(c)) if COLORS.contains(&c) => {}
        ("highlight", _) => {
            return Err(ApiError::validation(
                "a highlight needs a color: amber, sage, terracotta or night",
            ))
        }
        ("bookmark", None) => {}
        ("bookmark", Some(_)) => {
            return Err(ApiError::validation("a bookmark has no color"));
        }
        _ => return Err(ApiError::validation("kind must be highlight or bookmark")),
    }
    if body.cfi.is_empty() || too_long(&body.cfi, MAX_CFI) {
        return Err(ApiError::validation(format!(
            "cfi must be 1 to {MAX_CFI} characters"
        )));
    }
    if too_long(&body.text, MAX_TEXT) {
        return Err(ApiError::validation(format!(
            "text must be at most {MAX_TEXT} characters"
        )));
    }
    if body.note.as_deref().is_some_and(|n| too_long(n, MAX_NOTE)) {
        return Err(ApiError::validation(format!(
            "note must be at most {MAX_NOTE} characters"
        )));
    }
    if body
        .chapter
        .as_deref()
        .is_some_and(|c| too_long(c, MAX_CHAPTER))
    {
        return Err(ApiError::validation(format!(
            "chapter must be at most {MAX_CHAPTER} characters"
        )));
    }
    if !body.percent.is_finite() || !(0.0..=100.0).contains(&body.percent) {
        return Err(ApiError::validation("percent must be between 0 and 100"));
    }
    if body.updated_at > now + MAX_FUTURE_SECS {
        return Err(ApiError::validation(
            "updated_at is more than 5 minutes in the future",
        ));
    }
    Ok(())
}

#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/annotations",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id"), AnnotationsQuery),
    responses(
        (status = 200, description = "The caller's annotations in the book. Without `since`, the live ones by position; with it, everything changed after that time, deleted included", body = Vec<AnnotationOut>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn list_annotations(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    Query(q): Query<AnnotationsQuery>,
) -> ApiResult<Json<Vec<AnnotationOut>>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            if !book_exists(conn, &who, &id)? {
                return Ok(Err(ApiError::not_found()));
            }
            let rows = match q.since {
                None => {
                    let mut stmt = conn.prepare(&format!(
                        "SELECT {COLS} FROM annotations WHERE user_id = ?1 AND library_id = ?2 \
                         AND book_id = ?3 AND deleted_at IS NULL ORDER BY percent, created_at, id"
                    ))?;
                    let v = stmt
                        .query_map(params![who.user_id, who.library_id, id], row)?
                        .collect::<rusqlite::Result<Vec<_>>>()?;
                    v
                }
                Some(since) => {
                    let mut stmt = conn.prepare(&format!(
                        "SELECT {COLS} FROM annotations WHERE user_id = ?1 AND library_id = ?2 \
                         AND book_id = ?3 AND updated_at > ?4 ORDER BY updated_at, id"
                    ))?;
                    let v = stmt
                        .query_map(params![who.user_id, who.library_id, id, since], row)?
                        .collect::<rusqlite::Result<Vec<_>>>()?;
                    v
                }
            };
            Ok(Ok(rows))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    put,
    path = "/api/v1/books/{id}/annotations/{annotation_id}",
    tag = "reading",
    security(("bearer" = [])),
    params(
        ("id" = String, Path, description = "Book id"),
        ("annotation_id" = String, Path, description = "Annotation id, chosen by the device"),
    ),
    request_body = PutAnnotation,
    responses(
        (status = 200, description = "The stored annotation: the new one, or the saved one when it is as new or newer", body = AnnotationOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book, file or annotation of someone else", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn put_annotation(
    State(state): State<AppState>,
    who: AuthUser,
    Path((id, annotation_id)): Path<(String, String)>,
    ApiJson(body): ApiJson<PutAnnotation>,
) -> ApiResult<Json<AnnotationOut>> {
    who.require(Role::Member)?;
    validate(&body, now_secs())?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if !book_exists(&tx, &who, &id)? {
                return Ok(Err(ApiError::not_found()));
            }
            let file_ok: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM book_files WHERE book_id = ?1 AND sha256 = ?2 \
                 AND library_id = ?3)",
                params![id, body.file_sha256, who.library_id],
                |r| r.get(0),
            )?;
            if !file_ok {
                return Ok(Err(ApiError::not_found()));
            }
            // (owner, book, library, updated_at) of the saved row, if any: the id is
            // unique across the whole server, so look it up everywhere.
            let saved: Option<(String, String, String, i64)> = tx
                .query_row(
                    "SELECT user_id, book_id, library_id, updated_at FROM annotations \
                     WHERE id = ?1",
                    params![annotation_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;
            match saved {
                Some((owner, book, lib, _))
                    if owner != who.user_id || book != id || lib != who.library_id =>
                {
                    return Ok(Err(ApiError::not_found()));
                }
                Some((_, _, _, at)) if at >= body.updated_at => {}
                Some(_) => {
                    tx.execute(
                        "UPDATE annotations SET file_sha256 = ?1, kind = ?2, cfi = ?3, text = ?4, \
                         color = ?5, note = ?6, percent = ?7, chapter = ?8, created_at = ?9, \
                         updated_at = ?10, deleted_at = ?11 WHERE id = ?12",
                        params![
                            body.file_sha256,
                            body.kind,
                            body.cfi,
                            body.text,
                            body.color,
                            body.note,
                            body.percent,
                            body.chapter,
                            body.created_at,
                            body.updated_at,
                            body.deleted.then_some(body.updated_at),
                            annotation_id
                        ],
                    )?;
                }
                None => {
                    tx.execute(
                        "INSERT INTO annotations (id, library_id, user_id, book_id, file_sha256, \
                         kind, cfi, text, color, note, percent, chapter, created_at, updated_at, \
                         deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, \
                         ?13, ?14, ?15)",
                        params![
                            annotation_id,
                            who.library_id,
                            who.user_id,
                            id,
                            body.file_sha256,
                            body.kind,
                            body.cfi,
                            body.text,
                            body.color,
                            body.note,
                            body.percent,
                            body.chapter,
                            body.created_at,
                            body.updated_at,
                            body.deleted.then_some(body.updated_at)
                        ],
                    )?;
                }
            }
            let out = tx.query_row(
                &format!("SELECT {COLS} FROM annotations WHERE id = ?1"),
                [&annotation_id],
                row,
            )?;
            tx.commit()?;
            Ok(Ok(out))
        })
        .await??;
    Ok(Json(out))
}
