use std::collections::HashSet;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{new_id, now_secs},
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

const COLORS: [&str; 6] = ["sage", "terracotta", "night", "plum", "amber", "graphite"];
const MAX_BATCH: usize = 500;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/shelves", get(list_shelves).post(create_shelf))
        .route(
            "/api/v1/shelves/{id}",
            get(get_shelf).patch(update_shelf).delete(delete_shelf),
        )
        .route("/api/v1/shelves/{id}/books", get(shelf_books))
        .route("/api/v1/shelves/{id}/batch-assign", post(batch_assign))
        .route(
            "/api/v1/books/{id}/placement",
            put(place_book).delete(unplace_book),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        list_shelves,
        create_shelf,
        get_shelf,
        update_shelf,
        delete_shelf,
        shelf_books,
        place_book,
        unplace_book,
        batch_assign
    ),
    components(schemas(
        ShelfOut,
        ShelfList,
        ShelfBook,
        ShelfBookList,
        Placement,
        NewShelf,
        ShelfPatch,
        PlaceIn,
        BatchAssignIn,
        BatchAssignOut,
        PlacedItem
    ))
)]
pub struct Doc;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ShelfOut {
    pub id: String,
    pub name: String,
    pub rows: i64,
    pub slots_per_row: i64,
    pub color: String,
    pub icon: Option<String>,
    pub label_code: i64,
    pub room_id: Option<String>,
    /// `rows * slots_per_row`.
    pub capacity: i64,
    /// Number of books placed on the shelf.
    pub book_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ShelfList {
    pub items: Vec<ShelfOut>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ShelfBook {
    pub book_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub progressive_number: Option<i64>,
    pub cover_color: Option<String>,
    pub row_index: i64,
    pub slot_index: i64,
    pub spine_width: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ShelfBookList {
    pub items: Vec<ShelfBook>,
}

/// Where a book sits.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Placement {
    pub shelf_id: String,
    pub row_index: i64,
    pub slot_index: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct NewShelf {
    pub name: String,
    pub rows: i64,
    pub slots_per_row: i64,
    /// Defaults to `sage`.
    pub color: Option<String>,
    pub icon: Option<String>,
}

/// Distinguishes an absent field (`None`) from an explicit `null` (`Some(None)`).
fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ShelfPatch {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub name: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub rows: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub slots_per_row: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub color: Option<Option<String>>,
    /// `null` clears the icon.
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub icon: Option<Option<String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PlaceIn {
    pub shelf_id: String,
    pub row_index: i64,
    pub slot_index: i64,
    /// 1–3; absent keeps the current value.
    pub spine_width: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BatchAssignIn {
    /// At most 500 ids.
    pub book_ids: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PlacedItem {
    pub book_id: String,
    pub row_index: i64,
    pub slot_index: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BatchAssignOut {
    pub placed: Vec<PlacedItem>,
    pub skipped_already_placed: i64,
    pub skipped_no_space: i64,
}

/// Failure inside a database closure: an API error or a SQLite error.
enum Fail {
    Api(ApiError),
    Db(rusqlite::Error),
}

impl From<ApiError> for Fail {
    fn from(e: ApiError) -> Fail {
        Fail::Api(e)
    }
}

impl From<rusqlite::Error> for Fail {
    fn from(e: rusqlite::Error) -> Fail {
        Fail::Db(e)
    }
}

/// A violated `UNIQUE (shelf_id, row_index, slot_index)` means someone else took the slot.
fn slot_write(e: rusqlite::Error) -> Fail {
    if e.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
        Fail::Api(slot_taken())
    } else {
        Fail::Db(e)
    }
}

fn slot_taken() -> ApiError {
    ApiError::conflict("slot_taken", "That slot is already occupied")
}

async fn run<T: Send + 'static>(
    state: &AppState,
    f: impl FnOnce(&mut Connection) -> Result<T, Fail> + Send + 'static,
) -> ApiResult<T> {
    state
        .db
        .run(move |conn| match f(conn) {
            Ok(v) => Ok(Ok(v)),
            Err(Fail::Api(e)) => Ok(Err(e)),
            Err(Fail::Db(e)) => Err(e),
        })
        .await?
}

const SHELF_SELECT: &str = "SELECT s.id, s.name, s.rows, s.slots_per_row, s.color, s.icon, \
     s.label_code, s.room_id, s.created_at, s.updated_at, \
     (SELECT COUNT(*) FROM shelf_books sb WHERE sb.shelf_id = s.id) FROM shelves s";

fn shelf_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ShelfOut> {
    let rows: i64 = r.get(2)?;
    let slots: i64 = r.get(3)?;
    Ok(ShelfOut {
        id: r.get(0)?,
        name: r.get(1)?,
        rows,
        slots_per_row: slots,
        color: r.get(4)?,
        icon: r.get(5)?,
        label_code: r.get(6)?,
        room_id: r.get(7)?,
        capacity: rows * slots,
        book_count: r.get(10)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
    })
}

fn find_shelf(conn: &Connection, library_id: &str, id: &str) -> Result<ShelfOut, Fail> {
    conn.query_row(
        &format!("{SHELF_SELECT} WHERE s.library_id = ?1 AND s.id = ?2"),
        params![library_id, id],
        shelf_row,
    )
    .optional()?
    .ok_or_else(|| Fail::Api(ApiError::not_found()))
}

fn require_book(conn: &Connection, library_id: &str, id: &str) -> Result<(), Fail> {
    let found = conn
        .query_row(
            "SELECT 1 FROM books WHERE library_id = ?1 AND id = ?2",
            params![library_id, id],
            |_| Ok(()),
        )
        .optional()?;
    found.ok_or_else(|| Fail::Api(ApiError::not_found()))
}

fn check_name(name: &str) -> ApiResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::validation(
            "name must be between 1 and 80 characters",
        ));
    }
    Ok(name.to_string())
}

fn check_rows(rows: i64) -> ApiResult<i64> {
    if !(1..=12).contains(&rows) {
        return Err(ApiError::validation("rows must be between 1 and 12"));
    }
    Ok(rows)
}

fn check_slots(slots: i64) -> ApiResult<i64> {
    if !(5..=60).contains(&slots) {
        return Err(ApiError::validation(
            "slots_per_row must be between 5 and 60",
        ));
    }
    Ok(slots)
}

fn check_color(color: &str) -> ApiResult<String> {
    if !COLORS.contains(&color) {
        return Err(ApiError::validation("Unknown color"));
    }
    Ok(color.to_string())
}

fn check_icon(icon: Option<String>) -> ApiResult<Option<String>> {
    if let Some(i) = &icon {
        if i.chars().count() > 40 {
            return Err(ApiError::validation("icon must be at most 40 characters"));
        }
    }
    Ok(icon)
}

fn check_spine(w: Option<i64>) -> ApiResult<Option<i64>> {
    if let Some(w) = w {
        if !(1..=3).contains(&w) {
            return Err(ApiError::validation("spine_width must be between 1 and 3"));
        }
    }
    Ok(w)
}

#[utoipa::path(
    get, path = "/api/v1/shelves", tag = "shelves", security(("bearer" = [])),
    responses(
        (status = 200, description = "Shelves ordered by label code", body = ShelfList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn list_shelves(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ShelfList>> {
    let items = run(&state, move |conn| {
        let mut stmt = conn.prepare(&format!(
            "{SHELF_SELECT} WHERE s.library_id = ?1 ORDER BY s.label_code"
        ))?;
        let rows = stmt.query_map([&user.library_id], shelf_row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
    .await?;
    Ok(Json(ShelfList { items }))
}

#[utoipa::path(
    post, path = "/api/v1/shelves", tag = "shelves", security(("bearer" = [])),
    request_body = NewShelf,
    responses(
        (status = 201, description = "Created shelf", body = ShelfOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 422, description = "validation: invalid field", body = ApiErrorBody),
    )
)]
pub async fn create_shelf(
    State(state): State<AppState>,
    user: AuthUser,
    ApiJson(body): ApiJson<NewShelf>,
) -> ApiResult<(StatusCode, Json<ShelfOut>)> {
    user.require(Role::Member)?;
    let name = check_name(&body.name)?;
    let rows = check_rows(body.rows)?;
    let slots = check_slots(body.slots_per_row)?;
    let color = check_color(body.color.as_deref().unwrap_or("sage"))?;
    let icon = check_icon(body.icon)?;
    let shelf = run(&state, move |conn| {
        let tx = conn.transaction()?;
        let codes = {
            let mut stmt = tx.prepare(
                "SELECT label_code FROM shelves WHERE library_id = ?1 ORDER BY label_code",
            )?;
            let rows = stmt.query_map([&user.library_id], |r| r.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let mut label = 1;
        for c in codes {
            if c == label {
                label += 1;
            } else if c > label {
                break;
            }
        }
        let (id, now) = (new_id(), now_secs());
        tx.execute(
            "INSERT INTO shelves (id, library_id, name, rows, slots_per_row, color, icon, \
             label_code, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                id,
                user.library_id,
                name,
                rows,
                slots,
                color,
                icon,
                label,
                now
            ],
        )?;
        audit::record(&tx, &user, "shelf.create", "shelf", &id, None, now)?;
        let shelf = find_shelf(&tx, &user.library_id, &id)?;
        tx.commit()?;
        Ok(shelf)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(shelf)))
}

#[utoipa::path(
    get, path = "/api/v1/shelves/{id}", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Shelf id")),
    responses(
        (status = 200, description = "The shelf", body = ShelfOut),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown shelf", body = ApiErrorBody),
    )
)]
pub async fn get_shelf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<ShelfOut>> {
    let shelf = run(&state, move |conn| find_shelf(conn, &user.library_id, &id)).await?;
    Ok(Json(shelf))
}

fn required<T>(v: Option<Option<T>>, field: &str) -> ApiResult<Option<T>> {
    match v {
        Some(None) => Err(ApiError::validation(format!("{field} cannot be null"))),
        Some(Some(x)) => Ok(Some(x)),
        None => Ok(None),
    }
}

#[utoipa::path(
    patch, path = "/api/v1/shelves/{id}", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Shelf id")),
    request_body = ShelfPatch,
    responses(
        (status = 200, description = "Updated shelf", body = ShelfOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown shelf", body = ApiErrorBody),
        (status = 409, description = "shelf_too_small: a placed book would not fit", body = ApiErrorBody),
        (status = 422, description = "validation: invalid field", body = ApiErrorBody),
    )
)]
pub async fn update_shelf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<ShelfPatch>,
) -> ApiResult<Json<ShelfOut>> {
    user.require(Role::Member)?;
    let name = required(body.name, "name")?
        .map(|n| check_name(&n))
        .transpose()?;
    let rows = required(body.rows, "rows")?.map(check_rows).transpose()?;
    let slots = required(body.slots_per_row, "slots_per_row")?
        .map(check_slots)
        .transpose()?;
    let color = required(body.color, "color")?
        .map(|c| check_color(&c))
        .transpose()?;
    let icon = body.icon.map(check_icon).transpose()?;
    let shelf = run(&state, move |conn| {
        let tx = conn.transaction()?;
        let cur = find_shelf(&tx, &user.library_id, &id)?;
        let new_rows = rows.unwrap_or(cur.rows);
        let new_slots = slots.unwrap_or(cur.slots_per_row);
        if new_rows < cur.rows || new_slots < cur.slots_per_row {
            let outside: i64 = tx.query_row(
                "SELECT COUNT(*) FROM shelf_books \
                 WHERE shelf_id = ?1 AND (row_index >= ?2 OR slot_index >= ?3)",
                params![id, new_rows, new_slots],
                |r| r.get(0),
            )?;
            if outside > 0 {
                return Err(ApiError::conflict(
                    "shelf_too_small",
                    "A placed book would be left outside the shelf",
                )
                .into());
            }
        }
        let now = now_secs();
        let icon = match icon {
            Some(v) => v,
            None => cur.icon.clone(),
        };
        tx.execute(
            "UPDATE shelves SET name = ?1, rows = ?2, slots_per_row = ?3, color = ?4, icon = ?5, \
             updated_at = ?6 WHERE id = ?7 AND library_id = ?8",
            params![
                name.unwrap_or(cur.name),
                new_rows,
                new_slots,
                color.unwrap_or(cur.color),
                icon,
                now,
                id,
                user.library_id
            ],
        )?;
        audit::record(&tx, &user, "shelf.update", "shelf", &id, None, now)?;
        let shelf = find_shelf(&tx, &user.library_id, &id)?;
        tx.commit()?;
        Ok(shelf)
    })
    .await?;
    Ok(Json(shelf))
}

#[utoipa::path(
    delete, path = "/api/v1/shelves/{id}", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Shelf id")),
    responses(
        (status = 204, description = "Deleted; its books stay, unplaced"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown shelf", body = ApiErrorBody),
    )
)]
pub async fn delete_shelf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    user.require(Role::Member)?;
    run(&state, move |conn| {
        let tx = conn.transaction()?;
        find_shelf(&tx, &user.library_id, &id)?;
        tx.execute("DELETE FROM shelf_books WHERE shelf_id = ?1", [&id])?;
        tx.execute(
            "DELETE FROM shelves WHERE id = ?1 AND library_id = ?2",
            params![id, user.library_id],
        )?;
        audit::record(&tx, &user, "shelf.delete", "shelf", &id, None, now_secs())?;
        tx.commit()?;
        Ok(())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get, path = "/api/v1/shelves/{id}/books", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Shelf id")),
    responses(
        (status = 200, description = "Placed books by row then slot", body = ShelfBookList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown shelf", body = ApiErrorBody),
    )
)]
pub async fn shelf_books(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<ShelfBookList>> {
    let items = run(&state, move |conn| {
        find_shelf(conn, &user.library_id, &id)?;
        let mut stmt = conn.prepare(
            "SELECT b.id, b.title, b.authors_json, b.progressive_number, b.cover_color, \
                    sb.row_index, sb.slot_index, sb.spine_width \
             FROM shelf_books sb JOIN books b ON b.id = sb.book_id \
             WHERE sb.shelf_id = ?1 AND b.library_id = ?2 \
             ORDER BY sb.row_index, sb.slot_index",
        )?;
        let rows = stmt.query_map(params![id, user.library_id], |r| {
            let authors: String = r.get(2)?;
            Ok(ShelfBook {
                book_id: r.get(0)?,
                title: r.get(1)?,
                authors: serde_json::from_str(&authors).unwrap_or_default(),
                progressive_number: r.get(3)?,
                cover_color: r.get(4)?,
                row_index: r.get(5)?,
                slot_index: r.get(6)?,
                spine_width: r.get(7)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
    .await?;
    Ok(Json(ShelfBookList { items }))
}

#[utoipa::path(
    put, path = "/api/v1/books/{id}/placement", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = PlaceIn,
    responses(
        (status = 200, description = "New placement", body = Placement),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or shelf", body = ApiErrorBody),
        (status = 409, description = "slot_taken: slot occupied", body = ApiErrorBody),
        (status = 422, description = "validation: slot outside the shelf or bad spine_width", body = ApiErrorBody),
    )
)]
pub async fn place_book(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PlaceIn>,
) -> ApiResult<Json<Placement>> {
    user.require(Role::Member)?;
    let spine = check_spine(body.spine_width)?;
    let placement = run(&state, move |conn| {
        let tx = conn.transaction()?;
        require_book(&tx, &user.library_id, &id)?;
        let shelf = find_shelf(&tx, &user.library_id, &body.shelf_id)?;
        if !(0..shelf.rows).contains(&body.row_index)
            || !(0..shelf.slots_per_row).contains(&body.slot_index)
        {
            return Err(ApiError::validation("Slot is outside the shelf").into());
        }
        let occupant: Option<String> = tx
            .query_row(
                "SELECT book_id FROM shelf_books \
                 WHERE shelf_id = ?1 AND row_index = ?2 AND slot_index = ?3",
                params![shelf.id, body.row_index, body.slot_index],
                |r| r.get(0),
            )
            .optional()?;
        if occupant.is_some_and(|o| o != id) {
            return Err(slot_taken().into());
        }
        let now = now_secs();
        tx.execute(
            "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, spine_width, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(book_id) DO UPDATE SET shelf_id = excluded.shelf_id, \
               row_index = excluded.row_index, slot_index = excluded.slot_index, \
               spine_width = COALESCE(excluded.spine_width, shelf_books.spine_width), \
               updated_at = excluded.updated_at",
            params![id, shelf.id, body.row_index, body.slot_index, spine, now],
        )
        .map_err(slot_write)?;
        let detail = serde_json::json!({
            "shelf_id": shelf.id, "row_index": body.row_index, "slot_index": body.slot_index
        });
        audit::record(&tx, &user, "shelf.place", "book", &id, Some(&detail), now)?;
        tx.commit()?;
        Ok(Placement {
            shelf_id: shelf.id,
            row_index: body.row_index,
            slot_index: body.slot_index,
        })
    })
    .await?;
    Ok(Json(placement))
}

#[utoipa::path(
    delete, path = "/api/v1/books/{id}/placement", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 204, description = "Book is not placed (idempotent)"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn unplace_book(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    user.require(Role::Member)?;
    run(&state, move |conn| {
        let tx = conn.transaction()?;
        require_book(&tx, &user.library_id, &id)?;
        let removed = tx.execute("DELETE FROM shelf_books WHERE book_id = ?1", [&id])?;
        if removed > 0 {
            audit::record(&tx, &user, "shelf.unplace", "book", &id, None, now_secs())?;
        }
        tx.commit()?;
        Ok(())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post, path = "/api/v1/shelves/{id}/batch-assign", tag = "shelves", security(("bearer" = [])),
    params(("id" = String, Path, description = "Shelf id")),
    request_body = BatchAssignIn,
    responses(
        (status = 200, description = "What was placed and what was skipped", body = BatchAssignOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown shelf", body = ApiErrorBody),
        (status = 422, description = "validation: more than 500 ids", body = ApiErrorBody),
    )
)]
pub async fn batch_assign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<BatchAssignIn>,
) -> ApiResult<Json<BatchAssignOut>> {
    user.require(Role::Member)?;
    if body.book_ids.len() > MAX_BATCH {
        return Err(ApiError::validation("At most 500 book ids"));
    }
    let out = run(&state, move |conn| {
        let tx = conn.transaction()?;
        let shelf = find_shelf(&tx, &user.library_id, &id)?;
        let mut taken: HashSet<(i64, i64)> = {
            let mut stmt =
                tx.prepare("SELECT row_index, slot_index FROM shelf_books WHERE shelf_id = ?1")?;
            let rows = stmt.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        let mut cursor = 0i64;
        let capacity = shelf.capacity;
        let (mut placed, mut already, mut no_space) = (Vec::new(), 0, 0);
        let mut seen = HashSet::new();
        let now = now_secs();
        for book_id in body.book_ids {
            if !seen.insert(book_id.clone()) {
                continue;
            }
            if require_book(&tx, &user.library_id, &book_id).is_err() {
                continue;
            }
            let is_placed = tx
                .query_row(
                    "SELECT 1 FROM shelf_books WHERE book_id = ?1",
                    [&book_id],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if is_placed {
                already += 1;
                continue;
            }
            let slot = loop {
                if cursor >= capacity {
                    break None;
                }
                let pos = (cursor / shelf.slots_per_row, cursor % shelf.slots_per_row);
                cursor += 1;
                if !taken.contains(&pos) {
                    break Some(pos);
                }
            };
            let Some((row, slot)) = slot else {
                no_space += 1;
                continue;
            };
            taken.insert((row, slot));
            tx.execute(
                "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, spine_width, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
                params![book_id, id, row, slot, now],
            )
            .map_err(slot_write)?;
            let detail = serde_json::json!({
                "shelf_id": id, "row_index": row, "slot_index": slot
            });
            audit::record(&tx, &user, "shelf.place", "book", &book_id, Some(&detail), now)?;
            placed.push(PlacedItem {
                book_id,
                row_index: row,
                slot_index: slot,
            });
        }
        tx.commit()?;
        Ok(BatchAssignOut {
            placed,
            skipped_already_placed: already,
            skipped_no_space: no_space,
        })
    })
    .await?;
    Ok(Json(out))
}
