use axum::{extract::State, routing::get, Json};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;

use crate::{
    api::util::{to_isbn13, ApiQuery},
    auth::guard::AuthUser,
    error::{ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/books/isbn-index", get(isbn_index))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(isbn_index), components(schemas(IsbnIndex, IsbnEntry, ShelfRef)))]
pub struct Doc;

#[derive(Debug, Deserialize)]
pub struct IndexQuery {
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ShelfRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IsbnEntry {
    /// ISBN-13, digits only.
    pub isbn: String,
    pub book_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub shelf: Option<ShelfRef>,
    pub row_index: Option<i64>,
    pub slot_index: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IsbnIndex {
    /// Opaque fingerprint (SHA-256, hex) of the entries.
    pub version: String,
    /// True when the requested `version` is the current one; `items` is then empty.
    pub unchanged: bool,
    pub items: Vec<IsbnEntry>,
}

#[doc(hidden)]
pub const ISBN_INDEX_SQL: &str = "SELECT b.id, b.isbn_13, b.isbn_10, b.title, b.authors_json,
                        s.id, s.name, sb.row_index, sb.slot_index
                 FROM books b
                 LEFT JOIN shelf_books sb ON sb.book_id = b.id
                 LEFT JOIN shelves s ON s.id = sb.shelf_id
                 WHERE b.library_id = ?1
                   AND ((b.isbn_13 IS NOT NULL AND b.isbn_13 <> '')
                        OR (b.isbn_10 IS NOT NULL AND b.isbn_10 <> ''))";

/// Every book of the library with an ISBN, for the duplicate-purchase check.
#[utoipa::path(
    get,
    path = "/api/v1/books/isbn-index",
    tag = "books",
    security(("bearer" = [])),
    params(("version" = Option<String>, Query, description = "Version the client already has")),
    responses(
        (status = 200, description = "Entries sorted by isbn, then title; empty with `unchanged` when `version` is current", body = IsbnIndex),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 422, description = "validation: invalid query parameters", body = ApiErrorBody),
    )
)]
pub async fn isbn_index(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<IndexQuery>,
) -> ApiResult<Json<IsbnIndex>> {
    let mut items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(ISBN_INDEX_SQL)?;
            let rows = stmt
                .query_map([who.library_id.as_str()], |r| {
                    let isbn13: Option<String> = r.get(1)?;
                    let isbn10: Option<String> = r.get(2)?;
                    let authors: String = r.get(4)?;
                    let sid: Option<String> = r.get(5)?;
                    let sname: Option<String> = r.get(6)?;
                    let isbn = isbn13
                        .as_deref()
                        .and_then(to_isbn13)
                        .or_else(|| isbn10.as_deref().and_then(to_isbn13));
                    let (book_id, title, row_index, slot_index) =
                        (r.get(0)?, r.get(3)?, r.get(7)?, r.get(8)?);
                    Ok(isbn.map(|isbn| IsbnEntry {
                        isbn,
                        book_id,
                        title,
                        authors: serde_json::from_str(&authors).unwrap_or_default(),
                        shelf: sid.zip(sname).map(|(id, name)| ShelfRef { id, name }),
                        row_index,
                        slot_index,
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows.into_iter().flatten().collect::<Vec<_>>())
        })
        .await?;
    items.sort_by(|a, b| {
        a.isbn
            .cmp(&b.isbn)
            .then_with(|| a.title.cmp(&b.title))
            .then_with(|| a.book_id.cmp(&b.book_id))
    });
    let bytes = serde_json::to_vec(&items).map_err(|e| {
        let _ = e;
        crate::error::ApiError::internal()
    })?;
    let version = hex::encode(Sha256::digest(&bytes));
    if q.version.as_deref() == Some(version.as_str()) {
        return Ok(Json(IsbnIndex {
            version,
            unchanged: true,
            items: Vec::new(),
        }));
    }
    Ok(Json(IsbnIndex {
        version,
        unchanged: false,
        items,
    }))
}
