use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{new_id, now_secs, ApiQuery, Page},
    audit,
    auth::guard::AuthUser,
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route(
            "/api/v1/books/{id}/reading",
            get(get_reading).put(put_reading).delete(delete_reading),
        )
        .route("/api/v1/reading", get(list_reading))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(get_reading, put_reading, delete_reading, list_reading),
    components(schemas(
        ReadingOut,
        ReadingSummary,
        PutReading,
        ReadingBook,
        ReadingItem,
        ReadingList,
        ReadingQuery
    ))
)]
pub struct Doc;

pub const STATUSES: [&str; 4] = ["to_read", "reading", "read", "abandoned"];

const MAX_NOTE: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct ReadingOut {
    pub book_id: String,
    /// `to_read`, `reading`, `read` or `abandoned`.
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub rating: Option<i64>,
    pub note: Option<String>,
    pub current_page: Option<i64>,
    pub updated_at: i64,
}

/// The caller's reading state as shown inside a book.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct ReadingSummary {
    pub status: String,
    pub current_page: Option<i64>,
    pub rating: Option<i64>,
}

/// Body of `PUT /books/{id}/reading`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct PutReading {
    /// `to_read`, `reading`, `read` or `abandoned`.
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    /// 1 to 5.
    pub rating: Option<i64>,
    /// At most 2000 characters.
    pub note: Option<String>,
    pub current_page: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadingBook {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub cover_color: Option<String>,
    pub page_count: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadingItem {
    #[serde(flatten)]
    pub reading: ReadingOut,
    pub book: ReadingBook,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadingList {
    pub items: Vec<ReadingItem>,
    /// Count with the same filter, ignoring `limit` and `offset`.
    pub total: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ReadingQuery {
    /// `to_read`, `reading`, `read` or `abandoned`.
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// The fields stored once the transition rules have been applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub rating: Option<i64>,
    pub note: Option<String>,
    pub current_page: Option<i64>,
}

/// Validates a body and applies the automatic transitions. Pure: the clock and
/// the book's `page_count` are arguments.
pub fn resolve(input: PutReading, page_count: Option<i64>, now: i64) -> ApiResult<Resolved> {
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(ApiError::validation(
            "status must be to_read, reading, read or abandoned",
        ));
    }
    if let Some(r) = input.rating {
        if !(1..=5).contains(&r) {
            return Err(ApiError::validation("rating must be between 1 and 5"));
        }
    }
    if let Some(n) = &input.note {
        if n.chars().count() > MAX_NOTE {
            return Err(ApiError::validation(format!(
                "note must be at most {MAX_NOTE} characters"
            )));
        }
    }
    if let Some(p) = input.current_page {
        if p < 0 {
            return Err(ApiError::validation("current_page must not be negative"));
        }
        if page_count.is_some_and(|c| p > c) {
            return Err(ApiError::validation(
                "current_page must not exceed the book's page_count",
            ));
        }
    }
    let mut out = Resolved {
        status: input.status,
        started_at: input.started_at,
        finished_at: input.finished_at,
        rating: input.rating,
        note: input.note,
        current_page: input.current_page,
    };
    match out.status.as_str() {
        "to_read" => {
            out.started_at = None;
            out.finished_at = None;
            out.current_page = None;
        }
        "reading" => {
            out.started_at.get_or_insert(now);
        }
        "read" => {
            // Never earlier than the start the caller gave.
            let default = now.max(out.started_at.unwrap_or(i64::MIN));
            out.finished_at.get_or_insert(default);
            if page_count.is_some() {
                out.current_page = page_count;
            }
        }
        _ => {}
    }
    if let (Some(s), Some(f)) = (out.started_at, out.finished_at) {
        if f < s {
            return Err(ApiError::validation(
                "finished_at must not be before started_at",
            ));
        }
    }
    Ok(out)
}

const SELECT_READING: &str = "SELECT book_id, status, started_at, finished_at, rating, note, \
    current_page, updated_at FROM reading";

fn map_reading(r: &rusqlite::Row<'_>) -> rusqlite::Result<ReadingOut> {
    Ok(ReadingOut {
        book_id: r.get(0)?,
        status: r.get(1)?,
        started_at: r.get(2)?,
        finished_at: r.get(3)?,
        rating: r.get(4)?,
        note: r.get(5)?,
        current_page: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

fn fetch_reading(
    conn: &Connection,
    who: &AuthUser,
    book_id: &str,
) -> rusqlite::Result<Option<ReadingOut>> {
    conn.query_row(
        &format!("{SELECT_READING} WHERE user_id = ?1 AND book_id = ?2"),
        params![who.user_id, book_id],
        map_reading,
    )
    .optional()
}

/// `Some(page_count)` when the book exists in the caller's library.
fn book_page_count(
    conn: &Connection,
    who: &AuthUser,
    book_id: &str,
) -> rusqlite::Result<Option<Option<i64>>> {
    conn.query_row(
        "SELECT page_count FROM books WHERE id = ?1 AND library_id = ?2",
        params![book_id, who.library_id],
        |r| r.get(0),
    )
    .optional()
}

#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/reading",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "The caller's reading state, or null when there is none", body = Option<ReadingOut>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn get_reading(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Option<ReadingOut>>> {
    let out = state
        .db
        .run(move |conn| {
            if book_page_count(conn, &who, &id)?.is_none() {
                return Ok(Err(ApiError::not_found()));
            }
            Ok(Ok(fetch_reading(conn, &who, &id)?))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    put,
    path = "/api/v1/books/{id}/reading",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = PutReading,
    responses(
        (status = 200, description = "The stored state", body = ReadingOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn put_reading(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PutReading>,
) -> ApiResult<Json<ReadingOut>> {
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(page_count) = book_page_count(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let now = now_secs();
            let r = match resolve(body, page_count, now) {
                Ok(r) => r,
                Err(e) => return Ok(Err(e)),
            };
            tx.execute(
                "INSERT INTO reading (id, library_id, user_id, book_id, status, started_at, \
                 finished_at, rating, note, current_page, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
                 ON CONFLICT(user_id, book_id) DO UPDATE SET status = excluded.status, \
                 started_at = excluded.started_at, finished_at = excluded.finished_at, \
                 rating = excluded.rating, note = excluded.note, \
                 current_page = excluded.current_page, updated_at = excluded.updated_at",
                params![
                    new_id(),
                    who.library_id,
                    who.user_id,
                    id,
                    r.status,
                    r.started_at,
                    r.finished_at,
                    r.rating,
                    r.note,
                    r.current_page,
                    now
                ],
            )?;
            audit::record(
                &tx,
                &who,
                "reading.set",
                "reading",
                &id,
                Some(&serde_json::json!({ "status": r.status })),
                now,
            )?;
            let out = fetch_reading(&tx, &who, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/books/{id}/reading",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 204, description = "Deleted, or there was nothing to delete"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn delete_reading(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if book_page_count(&tx, &who, &id)?.is_none() {
                return Ok(Err(ApiError::not_found()));
            }
            tx.execute(
                "DELETE FROM reading WHERE user_id = ?1 AND book_id = ?2",
                params![who.user_id, id],
            )?;
            audit::record(
                &tx,
                &who,
                "reading.delete",
                "reading",
                &id,
                None,
                now_secs(),
            )?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/reading",
    tag = "reading",
    security(("bearer" = [])),
    params(
        ("status" = Option<String>, Query, description = "to_read, reading, read or abandoned"),
        ("limit" = Option<i64>, Query, description = "1 to 200, default 50"),
        ("offset" = Option<i64>, Query, description = "Default 0"),
    ),
    responses(
        (status = 200, description = "The caller's reading states, most recently updated first", body = ReadingList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 422, description = "validation: invalid query", body = ApiErrorBody),
    )
)]
pub async fn list_reading(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<ReadingQuery>,
) -> ApiResult<Json<ReadingList>> {
    let (limit, offset) = Page {
        limit: q.limit,
        offset: q.offset,
    }
    .resolve()?;
    if let Some(s) = q.status.as_deref() {
        if !STATUSES.contains(&s) {
            return Err(ApiError::validation(
                "status must be to_read, reading, read or abandoned",
            ));
        }
    }
    let out = state
        .db
        .run(move |conn| {
            // `?3` is NULL when no filter is asked for.
            let total: i64 = conn.query_row(
                "SELECT COUNT(*) FROM reading WHERE user_id = ?1 AND library_id = ?2 \
                 AND (?3 IS NULL OR status = ?3)",
                params![who.user_id, who.library_id, q.status],
                |r| r.get(0),
            )?;
            let mut stmt = conn.prepare(
                "SELECT r.book_id, r.status, r.started_at, r.finished_at, r.rating, r.note, \
                 r.current_page, r.updated_at, b.title, b.authors_json, b.cover_color, b.page_count \
                 FROM reading r JOIN books b ON b.id = r.book_id \
                 WHERE r.user_id = ?1 AND r.library_id = ?2 AND (?3 IS NULL OR r.status = ?3) \
                 ORDER BY r.updated_at DESC, r.id DESC LIMIT ?4 OFFSET ?5",
            )?;
            let items = stmt
                .query_map(
                    params![who.user_id, who.library_id, q.status, limit, offset],
                    |r| {
                        let reading = map_reading(r)?;
                        let authors_json: String = r.get(9)?;
                        Ok(ReadingItem {
                            book: ReadingBook {
                                id: reading.book_id.clone(),
                                title: r.get(8)?,
                                authors: serde_json::from_str(&authors_json).unwrap_or_default(),
                                cover_color: r.get(10)?,
                                page_count: r.get(11)?,
                            },
                            reading,
                        })
                    },
                )?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(ReadingList { items, total })
        })
        .await?;
    Ok(Json(out))
}

/// Fills `reading` of each book with the caller's state, one query for the lot.
pub fn attach_reading(
    conn: &Connection,
    user_id: &str,
    books: &mut [crate::api::books::BookOut],
) -> rusqlite::Result<()> {
    if books.is_empty() {
        return Ok(());
    }
    let marks = vec!["?"; books.len()].join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT book_id, status, current_page, rating FROM reading \
         WHERE user_id = ?1 AND book_id IN ({marks})"
    ))?;
    let args = std::iter::once(user_id).chain(books.iter().map(|b| b.id.as_str()));
    let found: std::collections::HashMap<String, ReadingSummary> = stmt
        .query_map(rusqlite::params_from_iter(args), |r| {
            Ok((
                r.get::<_, String>(0)?,
                ReadingSummary {
                    status: r.get(1)?,
                    current_page: r.get(2)?,
                    rating: r.get(3)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    for b in books {
        b.reading = found.get(&b.id).cloned();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(status: &str) -> PutReading {
        PutReading {
            status: status.into(),
            started_at: None,
            finished_at: None,
            rating: None,
            note: None,
            current_page: None,
        }
    }

    #[test]
    fn reading_defaults_started_at_to_now() {
        let r = resolve(input("reading"), Some(300), 1000).unwrap();
        assert_eq!(r.started_at, Some(1000));
        assert_eq!(r.finished_at, None);
        let mut i = input("reading");
        i.started_at = Some(5);
        assert_eq!(resolve(i, None, 1000).unwrap().started_at, Some(5));
    }

    #[test]
    fn read_defaults_finish_and_completes_the_page() {
        let r = resolve(input("read"), Some(300), 1000).unwrap();
        assert_eq!(r.finished_at, Some(1000));
        assert_eq!(r.current_page, Some(300));
        let mut i = input("read");
        i.current_page = Some(10);
        assert_eq!(resolve(i, None, 1000).unwrap().current_page, Some(10));
        let mut i = input("read");
        i.started_at = Some(2000);
        assert_eq!(resolve(i, None, 1000).unwrap().finished_at, Some(2000));
    }

    #[test]
    fn to_read_clears_dates_and_page_but_keeps_rating_and_note() {
        let mut i = input("to_read");
        i.started_at = Some(1);
        i.finished_at = Some(2);
        i.current_page = Some(3);
        i.rating = Some(4);
        i.note = Some("n".into());
        let r = resolve(i, Some(10), 1000).unwrap();
        assert_eq!(
            (r.started_at, r.finished_at, r.current_page),
            (None, None, None)
        );
        assert_eq!((r.rating, r.note.as_deref()), (Some(4), Some("n")));
    }

    #[test]
    fn abandoned_keeps_what_was_given() {
        let mut i = input("abandoned");
        i.started_at = Some(1);
        i.current_page = Some(50);
        let r = resolve(i, Some(100), 1000).unwrap();
        assert_eq!(
            (r.started_at, r.finished_at, r.current_page),
            (Some(1), None, Some(50))
        );
    }

    #[test]
    fn rejects_invalid_input() {
        let bad = |f: &dyn Fn(&mut PutReading), pc: Option<i64>| {
            let mut i = input("reading");
            f(&mut i);
            assert!(resolve(i, pc, 1000).is_err());
        };
        bad(&|i| i.status = "done".into(), None);
        bad(&|i| i.rating = Some(0), None);
        bad(&|i| i.rating = Some(6), None);
        bad(&|i| i.note = Some("x".repeat(2001)), None);
        bad(
            &|i| {
                i.started_at = Some(10);
                i.finished_at = Some(9);
            },
            None,
        );
        bad(&|i| i.current_page = Some(-1), None);
        bad(&|i| i.current_page = Some(101), Some(100));
        let mut ok = input("reading");
        ok.note = Some("x".repeat(2000));
        ok.rating = Some(5);
        ok.current_page = Some(100);
        assert!(resolve(ok, Some(100), 1000).is_ok());
    }
}
