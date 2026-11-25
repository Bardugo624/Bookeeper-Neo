use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;

use crate::{
    api::{
        books::{fetch as fetch_book, insert_in_tx, validate_new, BookOut, CreateBook},
        util::{new_id, normalize_isbn10, normalize_isbn13, now_secs},
    },
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/wishlist", get(list_wishlist).post(create_wish))
        .route(
            "/api/v1/wishlist/{id}",
            axum::routing::patch(patch_wish).delete(delete_wish),
        )
        .route("/api/v1/wishlist/{id}/convert", post(convert_wish))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_wishlist, create_wish, patch_wish, delete_wish, convert_wish),
    components(schemas(WishOut, WishList, CreateWish, PatchWish))
)]
pub struct Doc;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct WishOut {
    pub id: String,
    pub user_id: String,
    pub isbn: Option<String>,
    pub title: String,
    pub authors: Option<String>,
    pub source_url: Option<String>,
    pub priority: i64,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct WishList {
    pub items: Vec<WishOut>,
}

/// Body of `POST /wishlist`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateWish {
    pub title: String,
    pub isbn: Option<String>,
    pub authors: Option<String>,
    pub source_url: Option<String>,
    /// 0 to 2, default 0.
    pub priority: Option<i64>,
    pub notes: Option<String>,
}

fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

/// Body of `PATCH /wishlist/{id}`: absent = unchanged, `null` clears an
/// optional field (`title` and `priority` cannot be null).
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct PatchWish {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub title: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub isbn: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub authors: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub source_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub priority: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub notes: Option<Option<String>>,
}

const SELECT_WISH: &str =
    "SELECT id, user_id, isbn, title, authors, source_url, priority, notes, created_at FROM wishlist";

fn map_wish(r: &rusqlite::Row<'_>) -> rusqlite::Result<WishOut> {
    Ok(WishOut {
        id: r.get(0)?,
        user_id: r.get(1)?,
        isbn: r.get(2)?,
        title: r.get(3)?,
        authors: r.get(4)?,
        source_url: r.get(5)?,
        priority: r.get(6)?,
        notes: r.get(7)?,
        created_at: r.get(8)?,
    })
}

/// A wish is visible only to the user who owns it.
fn fetch(conn: &Connection, who: &AuthUser, id: &str) -> rusqlite::Result<Option<WishOut>> {
    conn.query_row(
        &format!("{SELECT_WISH} WHERE library_id = ?1 AND user_id = ?2 AND id = ?3"),
        params![who.library_id, who.user_id, id],
        map_wish,
    )
    .optional()
}

fn max_len(name: &str, v: &Option<String>, max: usize) -> ApiResult<()> {
    match v {
        Some(s) if s.chars().count() > max => Err(ApiError::validation(format!(
            "{name} must be at most {max} characters"
        ))),
        _ => Ok(()),
    }
}

fn check_title(raw: &str) -> ApiResult<String> {
    let t = raw.trim();
    if !(1..=300).contains(&t.chars().count()) {
        return Err(ApiError::validation(
            "title must be between 1 and 300 characters",
        ));
    }
    Ok(t.to_string())
}

fn check_priority(p: i64) -> ApiResult<i64> {
    if !(0..=2).contains(&p) {
        return Err(ApiError::validation("priority must be between 0 and 2"));
    }
    Ok(p)
}

fn check_optional(
    isbn: &Option<String>,
    authors: &Option<String>,
    source_url: &Option<String>,
    notes: &Option<String>,
) -> ApiResult<()> {
    max_len("isbn", isbn, 20)?;
    max_len("authors", authors, 500)?;
    max_len("source_url", source_url, 2000)?;
    max_len("notes", notes, 10_000)
}

#[utoipa::path(
    get,
    path = "/api/v1/wishlist",
    tag = "wishlist",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "The caller's wishlist", body = WishList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn list_wishlist(
    State(state): State<AppState>,
    who: AuthUser,
) -> ApiResult<Json<WishList>> {
    let items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(&format!(
                "{SELECT_WISH} WHERE library_id = ?1 AND user_id = ?2 \
                 ORDER BY priority DESC, created_at DESC, id DESC"
            ))?;
            let rows = stmt
                .query_map(params![who.library_id, who.user_id], map_wish)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    Ok(Json(WishList { items }))
}

#[utoipa::path(
    post,
    path = "/api/v1/wishlist",
    tag = "wishlist",
    security(("bearer" = [])),
    request_body = CreateWish,
    responses(
        (status = 201, description = "Created item", body = WishOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot write", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn create_wish(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<CreateWish>,
) -> ApiResult<(StatusCode, Json<WishOut>)> {
    who.require(Role::Member)?;
    let title = check_title(&body.title)?;
    let priority = check_priority(body.priority.unwrap_or(0))?;
    check_optional(&body.isbn, &body.authors, &body.source_url, &body.notes)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let id = new_id();
            let now = now_secs();
            tx.execute(
                "INSERT INTO wishlist (id, library_id, user_id, isbn, title, authors, \
                 source_url, priority, notes, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    id,
                    who.library_id,
                    who.user_id,
                    body.isbn,
                    title,
                    body.authors,
                    body.source_url,
                    priority,
                    body.notes,
                    now
                ],
            )?;
            audit::record(
                &tx,
                &who,
                "wishlist.create",
                "wishlist",
                &id,
                Some(&serde_json::json!({ "title": title })),
                now,
            )?;
            let out = fetch(&tx, &who, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    patch,
    path = "/api/v1/wishlist/{id}",
    tag = "wishlist",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Wishlist item id")),
    request_body = PatchWish,
    responses(
        (status = 200, description = "Updated item", body = WishOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot write", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown item", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn patch_wish(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PatchWish>,
) -> ApiResult<Json<WishOut>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(cur) = fetch(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let title = match body.title {
                None => cur.title.clone(),
                Some(Some(t)) => match check_title(&t) {
                    Ok(t) => t,
                    Err(e) => return Ok(Err(e)),
                },
                Some(None) => return Ok(Err(ApiError::validation("title cannot be null"))),
            };
            let priority = match body.priority {
                None => cur.priority,
                Some(Some(p)) => match check_priority(p) {
                    Ok(p) => p,
                    Err(e) => return Ok(Err(e)),
                },
                Some(None) => return Ok(Err(ApiError::validation("priority cannot be null"))),
            };
            let isbn = body.isbn.unwrap_or(cur.isbn);
            let authors = body.authors.unwrap_or(cur.authors);
            let source_url = body.source_url.unwrap_or(cur.source_url);
            let notes = body.notes.unwrap_or(cur.notes);
            if let Err(e) = check_optional(&isbn, &authors, &source_url, &notes) {
                return Ok(Err(e));
            }
            tx.execute(
                "UPDATE wishlist SET title = ?1, isbn = ?2, authors = ?3, source_url = ?4, \
                 priority = ?5, notes = ?6 WHERE id = ?7 AND library_id = ?8 AND user_id = ?9",
                params![
                    title,
                    isbn,
                    authors,
                    source_url,
                    priority,
                    notes,
                    id,
                    who.library_id,
                    who.user_id
                ],
            )?;
            audit::record(
                &tx,
                &who,
                "wishlist.update",
                "wishlist",
                &id,
                None,
                now_secs(),
            )?;
            let out = fetch(&tx, &who, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/wishlist/{id}",
    tag = "wishlist",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Wishlist item id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot write", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown item", body = ApiErrorBody),
    )
)]
pub async fn delete_wish(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let n = tx.execute(
                "DELETE FROM wishlist WHERE id = ?1 AND library_id = ?2 AND user_id = ?3",
                params![id, who.library_id, who.user_id],
            )?;
            if n == 0 {
                return Ok(Err(ApiError::not_found()));
            }
            audit::record(
                &tx,
                &who,
                "wishlist.delete",
                "wishlist",
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

fn split_authors(raw: Option<&str>) -> Vec<String> {
    raw.unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

#[utoipa::path(
    post,
    path = "/api/v1/wishlist/{id}/convert",
    tag = "wishlist",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Wishlist item id")),
    responses(
        (status = 201, description = "The new book; the item is removed", body = BookOut),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot write", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown item", body = ApiErrorBody),
        (status = 409, description = "progressive_taken: book conflict", body = ApiErrorBody),
        (status = 422, description = "validation: the item does not make a valid book", body = ApiErrorBody),
    )
)]
pub async fn convert_wish(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<(StatusCode, Json<BookOut>)> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(wish) = fetch(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let isbn = wish.isbn.as_deref();
            let isbn_13 = isbn.and_then(normalize_isbn13);
            let isbn_10 = if isbn_13.is_none() {
                isbn.and_then(normalize_isbn10)
            } else {
                None
            };
            let new = match validate_new(CreateBook {
                title: wish.title.clone(),
                authors: split_authors(wish.authors.as_deref()),
                isbn_13,
                isbn_10,
                notes: wish.notes.clone(),
                ..Default::default()
            }) {
                Ok(n) => n,
                Err(e) => return Ok(Err(e)),
            };
            let now = now_secs();
            let book_id = match insert_in_tx(&tx, &who, &new, now)? {
                Ok(b) => b,
                Err(e) => return Ok(Err(e)),
            };
            tx.execute(
                "DELETE FROM wishlist WHERE id = ?1 AND library_id = ?2 AND user_id = ?3",
                params![id, who.library_id, who.user_id],
            )?;
            audit::record(
                &tx,
                &who,
                "wishlist.convert",
                "wishlist",
                &id,
                Some(&serde_json::json!({ "book_id": book_id })),
                now,
            )?;
            let out = fetch_book(&tx, &who.library_id, &book_id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}
