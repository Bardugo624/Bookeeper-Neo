use axum::{
    extract::{Path, State},
    routing::get,
    Json,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    api::util::PersonRef,
    auth::guard::AuthUser,
    error::{ApiError, ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/books/{id}/readers", get(list_readers))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(list_readers), components(schemas(Reader, ReaderList)))]
pub struct Doc;

/// What the family sees of someone's reading: state and dates only. Rating,
/// note and current page stay private to their author.
#[derive(Debug, Serialize, ToSchema)]
pub struct Reader {
    pub user: PersonRef,
    /// True for the caller.
    pub is_me: bool,
    /// `to_read`, `reading`, `read` or `abandoned`.
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReaderList {
    pub items: Vec<Reader>,
}

#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/readers",
    tag = "reading",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "Who of the library has a reading state for the book: reading, to_read, read (most recent first), abandoned", body = ReaderList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn list_readers(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<ReaderList>> {
    let items = state
        .db
        .run(move |conn| {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM books WHERE id = ?1 AND library_id = ?2)",
                rusqlite::params![id, who.library_id],
                |r| r.get(0),
            )?;
            if !exists {
                return Ok(Err(ApiError::not_found()));
            }
            // Only the columns that may be shown are selected.
            let mut stmt = conn.prepare(
                "SELECT u.id, u.display_name, rd.status, rd.started_at, rd.finished_at \
                 FROM reading rd JOIN users u ON u.id = rd.user_id \
                 WHERE rd.book_id = ?1 AND rd.library_id = ?2 AND u.library_id = ?2 \
                 ORDER BY CASE rd.status WHEN 'reading' THEN 0 WHEN 'to_read' THEN 1 \
                          WHEN 'read' THEN 2 ELSE 3 END, \
                 CASE WHEN rd.status = 'read' THEN COALESCE(rd.finished_at, rd.updated_at) END DESC, \
                 u.display_name COLLATE NOCASE, u.id",
            )?;
            let rows = stmt
                .query_map(rusqlite::params![id, who.library_id], |r| {
                    let uid: String = r.get(0)?;
                    Ok(Reader {
                        is_me: uid == who.user_id,
                        user: PersonRef {
                            id: uid,
                            display_name: r.get(1)?,
                        },
                        status: r.get(2)?,
                        started_at: r.get(3)?,
                        finished_at: r.get(4)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(Ok(rows))
        })
        .await??;
    Ok(Json(ReaderList { items }))
}
