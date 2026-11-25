use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, put},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::{
        books::BookOut,
        reading::attach_reading,
        util::{new_id, now_secs},
    },
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/tags", get(list_tags).post(create_tag))
        .route("/api/v1/tags/{id}", patch(patch_tag).delete(delete_tag))
        .route("/api/v1/books/{id}/tags", put(put_book_tags))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_tags, create_tag, patch_tag, delete_tag, put_book_tags),
    components(schemas(TagOut, TagList, TagSummary, CreateTag, PatchTag, PutBookTags))
)]
pub struct Doc;

/// Same colours as the `shelves.color` constraint.
pub const COLORS: [&str; 6] = ["sage", "terracotta", "night", "plum", "amber", "graphite"];
const MAX_NAME: usize = 40;
const MAX_PER_BOOK: usize = 20;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TagOut {
    pub id: String,
    pub name: String,
    /// `sage`, `terracotta`, `night`, `plum`, `amber` or `graphite`.
    pub color: String,
    /// Books of the library carrying the tag.
    pub book_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TagList {
    pub items: Vec<TagOut>,
}

/// A tag as shown inside a book.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct TagSummary {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// Body of `POST /tags`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateTag {
    /// 1 to 40 characters, unique in the library ignoring case and outer spaces.
    pub name: String,
    /// One of the shelf colours; default `sage`.
    pub color: Option<String>,
}

/// Body of `PATCH /tags/{id}`: absent = unchanged.
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct PatchTag {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub name: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub color: Option<Option<String>>,
}

/// Distinguishes an absent field (`None`) from an explicit `null` (`Some(None)`).
fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

/// Body of `PUT /books/{id}/tags`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PutBookTags {
    /// The full set of tags of the book; at most 20 distinct ids.
    pub tag_ids: Vec<String>,
}

fn check_name(raw: &str) -> ApiResult<String> {
    let n = raw.trim();
    if !(1..=MAX_NAME).contains(&n.chars().count()) {
        return Err(ApiError::validation(format!(
            "name must be between 1 and {MAX_NAME} characters"
        )));
    }
    Ok(n.to_string())
}

fn check_color(c: &str) -> ApiResult<()> {
    if COLORS.contains(&c) {
        Ok(())
    } else {
        Err(ApiError::validation(format!(
            "color must be one of {}",
            COLORS.join(", ")
        )))
    }
}

fn exists_error() -> ApiError {
    ApiError::conflict("tag_exists", "a tag with this name already exists")
}

/// Whether another tag of the library has this name, ignoring case.
fn name_taken(
    conn: &Connection,
    library_id: &str,
    name: &str,
    except: Option<&str>,
) -> rusqlite::Result<bool> {
    let wanted = name.to_lowercase();
    let mut stmt = conn.prepare("SELECT id, name FROM tags WHERE library_id = ?1")?;
    let rows = stmt.query_map([library_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, n) = row?;
        if Some(id.as_str()) != except && n.trim().to_lowercase() == wanted {
            return Ok(true);
        }
    }
    Ok(false)
}

const SELECT_TAG: &str = "SELECT t.id, t.name, t.color, \
    (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id = t.id) FROM tags t";

fn map_tag(r: &rusqlite::Row<'_>) -> rusqlite::Result<TagOut> {
    Ok(TagOut {
        id: r.get(0)?,
        name: r.get(1)?,
        color: r.get(2)?,
        book_count: r.get(3)?,
    })
}

fn fetch(conn: &Connection, library_id: &str, id: &str) -> rusqlite::Result<Option<TagOut>> {
    conn.query_row(
        &format!("{SELECT_TAG} WHERE t.library_id = ?1 AND t.id = ?2"),
        params![library_id, id],
        map_tag,
    )
    .optional()
}

#[utoipa::path(
    get,
    path = "/api/v1/tags",
    tag = "tags",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "The library's tags, by name", body = TagList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn list_tags(State(state): State<AppState>, who: AuthUser) -> ApiResult<Json<TagList>> {
    let items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(&format!(
                "{SELECT_TAG} WHERE t.library_id = ?1 ORDER BY t.name COLLATE NOCASE, t.id"
            ))?;
            let rows = stmt
                .query_map([&who.library_id], map_tag)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    Ok(Json(TagList { items }))
}

#[utoipa::path(
    post,
    path = "/api/v1/tags",
    tag = "tags",
    security(("bearer" = [])),
    request_body = CreateTag,
    responses(
        (status = 201, description = "Created tag", body = TagOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 409, description = "tag_exists: the name is taken", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn create_tag(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<CreateTag>,
) -> ApiResult<(StatusCode, Json<TagOut>)> {
    who.require(Role::Member)?;
    let name = check_name(&body.name)?;
    let color = body.color.unwrap_or_else(|| "sage".to_string());
    check_color(&color)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if name_taken(&tx, &who.library_id, &name, None)? {
                return Ok(Err(exists_error()));
            }
            let id = new_id();
            tx.execute(
                "INSERT INTO tags (id, library_id, name, color) VALUES (?1, ?2, ?3, ?4)",
                params![id, who.library_id, name, color],
            )?;
            audit::record(
                &tx,
                &who,
                "tag.create",
                "tag",
                &id,
                Some(&serde_json::json!({ "name": name })),
                now_secs(),
            )?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    patch,
    path = "/api/v1/tags/{id}",
    tag = "tags",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Tag id")),
    request_body = PatchTag,
    responses(
        (status = 200, description = "Updated tag", body = TagOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown tag", body = ApiErrorBody),
        (status = 409, description = "tag_exists: the name is taken", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn patch_tag(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PatchTag>,
) -> ApiResult<Json<TagOut>> {
    who.require(Role::Member)?;
    let name = match body.name {
        None => None,
        Some(None) => return Err(ApiError::validation("name cannot be null")),
        Some(Some(n)) => Some(check_name(&n)?),
    };
    let color = match body.color {
        None => None,
        Some(None) => return Err(ApiError::validation("color cannot be null")),
        Some(Some(c)) => {
            check_color(&c)?;
            Some(c)
        }
    };
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(cur) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let name = name.unwrap_or(cur.name);
            let color = color.unwrap_or(cur.color);
            if name_taken(&tx, &who.library_id, &name, Some(&id))? {
                return Ok(Err(exists_error()));
            }
            tx.execute(
                "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3 AND library_id = ?4",
                params![name, color, id, who.library_id],
            )?;
            audit::record(&tx, &who, "tag.update", "tag", &id, None, now_secs())?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/tags/{id}",
    tag = "tags",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Tag id")),
    responses(
        (status = 204, description = "Deleted, along with its assignments; the books stay"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown tag", body = ApiErrorBody),
    )
)]
pub async fn delete_tag(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            // Explicit, so it does not depend on the foreign keys pragma.
            tx.execute(
                "DELETE FROM book_tags WHERE tag_id IN \
                 (SELECT id FROM tags WHERE id = ?1 AND library_id = ?2)",
                params![id, who.library_id],
            )?;
            let n = tx.execute(
                "DELETE FROM tags WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            if n == 0 {
                return Ok(Err(ApiError::not_found()));
            }
            audit::record(&tx, &who, "tag.delete", "tag", &id, None, now_secs())?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    put,
    path = "/api/v1/books/{id}/tags",
    tag = "tags",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = PutBookTags,
    responses(
        (status = 200, description = "The book with its new tags", body = BookOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or tag; nothing changes", body = ApiErrorBody),
        (status = 422, description = "validation: more than 20 tags", body = ApiErrorBody),
    )
)]
pub async fn put_book_tags(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PutBookTags>,
) -> ApiResult<Json<BookOut>> {
    who.require(Role::Member)?;
    let mut seen = std::collections::HashSet::new();
    let tag_ids: Vec<String> = body
        .tag_ids
        .into_iter()
        .filter(|t| seen.insert(t.clone()))
        .collect();
    if tag_ids.len() > MAX_PER_BOOK {
        return Err(ApiError::validation(format!(
            "a book takes at most {MAX_PER_BOOK} tags"
        )));
    }
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let book: Option<String> = tx
                .query_row(
                    "SELECT id FROM books WHERE id = ?1 AND library_id = ?2",
                    params![id, who.library_id],
                    |r| r.get(0),
                )
                .optional()?;
            if book.is_none() {
                return Ok(Err(ApiError::not_found()));
            }
            for t in &tag_ids {
                let found: Option<String> = tx
                    .query_row(
                        "SELECT id FROM tags WHERE id = ?1 AND library_id = ?2",
                        params![t, who.library_id],
                        |r| r.get(0),
                    )
                    .optional()?;
                if found.is_none() {
                    return Ok(Err(ApiError::not_found()));
                }
            }
            tx.execute("DELETE FROM book_tags WHERE book_id = ?1", [&id])?;
            for t in &tag_ids {
                tx.execute(
                    "INSERT INTO book_tags (book_id, tag_id) VALUES (?1, ?2)",
                    params![id, t],
                )?;
            }
            audit::record(
                &tx,
                &who,
                "book.tags",
                "book",
                &id,
                Some(&serde_json::json!({ "count": tag_ids.len() })),
                now_secs(),
            )?;
            let mut out = crate::api::books::fetch(&tx, &who.library_id, &id)?;
            if let Some(b) = out.as_mut() {
                attach_reading(&tx, &who.user_id, std::slice::from_mut(b))?;
                attach_tags(&tx, std::slice::from_mut(b))?;
            }
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

/// Fills `tags` of each book, ordered by name, one query for the lot.
pub fn attach_tags(conn: &Connection, books: &mut [BookOut]) -> rusqlite::Result<()> {
    if books.is_empty() {
        return Ok(());
    }
    let marks = vec!["?"; books.len()].join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT bt.book_id, t.id, t.name, t.color FROM book_tags bt \
         JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id IN ({marks}) \
         ORDER BY t.name COLLATE NOCASE, t.id"
    ))?;
    let mut found: std::collections::HashMap<String, Vec<TagSummary>> = Default::default();
    let rows = stmt.query_map(
        rusqlite::params_from_iter(books.iter().map(|b| b.id.as_str())),
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                TagSummary {
                    id: r.get(1)?,
                    name: r.get(2)?,
                    color: r.get(3)?,
                },
            ))
        },
    )?;
    for row in rows {
        let (book_id, tag) = row?;
        found.entry(book_id).or_default().push(tag);
    }
    for b in books {
        b.tags = found.remove(&b.id).unwrap_or_default();
    }
    Ok(())
}
