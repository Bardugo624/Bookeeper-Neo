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
    api::util::{new_id, normalize_isbn10, normalize_isbn13, now_secs},
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/books", post(create_book))
        .route("/api/v1/books/batch-delete", post(batch_delete))
        .route("/api/v1/books/next-progressive", get(next_progressive))
        .route(
            "/api/v1/books/{id}",
            get(get_book).patch(patch_book).delete(delete_book),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        create_book,
        get_book,
        patch_book,
        delete_book,
        batch_delete,
        next_progressive
    ),
    components(schemas(
        BookOut,
        Placement,
        CreateBook,
        PatchBook,
        BatchDelete,
        BatchDeleted,
        NextProgressive
    ))
)]
pub struct Doc;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct Placement {
    pub shelf_id: String,
    pub row_index: i64,
    pub slot_index: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BookOut {
    pub id: String,
    pub isbn_13: Option<String>,
    pub isbn_10: Option<String>,
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i64>,
    pub language: Option<String>,
    pub page_count: Option<i64>,
    pub description: Option<String>,
    pub genre: Option<String>,
    /// `hardcover`, `paperback`, `ebook` or `audiobook`.
    pub format: Option<String>,
    pub progressive_number: Option<i64>,
    pub condition: Option<String>,
    pub acquired_at: Option<i64>,
    pub price_cents: Option<i64>,
    pub notes: Option<String>,
    pub cover_color: Option<String>,
    pub placement: Option<Placement>,
    pub on_loan: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Body of `POST /books`. Only `title` is required.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct CreateBook {
    pub isbn_13: Option<String>,
    pub isbn_10: Option<String>,
    pub title: String,
    pub subtitle: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i64>,
    pub language: Option<String>,
    pub page_count: Option<i64>,
    pub description: Option<String>,
    pub genre: Option<String>,
    pub format: Option<String>,
    pub progressive_number: Option<i64>,
    pub condition: Option<String>,
    pub acquired_at: Option<i64>,
    pub price_cents: Option<i64>,
    pub notes: Option<String>,
}

/// A creation body that passed validation.
#[derive(Debug, Clone)]
pub struct NewBook {
    pub isbn_13: Option<String>,
    pub isbn_10: Option<String>,
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i64>,
    pub language: Option<String>,
    pub page_count: Option<i64>,
    pub description: Option<String>,
    pub genre: Option<String>,
    pub format: Option<String>,
    pub progressive_number: Option<i64>,
    pub condition: Option<String>,
    pub acquired_at: Option<i64>,
    pub price_cents: Option<i64>,
    pub notes: Option<String>,
}

/// Distinguishes an absent field (`None`) from an explicit `null` (`Some(None)`).
fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

/// Body of `PATCH /books/{id}`: an absent field is left alone, `null` clears
/// an optional field (`title` cannot be cleared).
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct PatchBook {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub isbn_13: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub isbn_10: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub title: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub subtitle: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<Vec<String>>)]
    pub authors: Option<Option<Vec<String>>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub publisher: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub published_year: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub language: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub page_count: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub genre: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub format: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub progressive_number: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub condition: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub acquired_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub price_cents: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub notes: Option<Option<String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BatchDelete {
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BatchDeleted {
    pub deleted: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NextProgressive {
    pub next: i64,
}

fn check_text(name: &str, value: &Option<String>, max: usize) -> ApiResult<()> {
    match value {
        Some(v) if v.chars().count() > max => Err(ApiError::validation(format!(
            "{name} must be at most {max} characters"
        ))),
        _ => Ok(()),
    }
}

fn check_range(name: &str, value: Option<i64>, min: i64, max: i64) -> ApiResult<()> {
    match value {
        Some(v) if v < min || v > max => Err(ApiError::validation(format!(
            "{name} must be between {min} and {max}"
        ))),
        _ => Ok(()),
    }
}

/// Validates a creation body; ISBNs come back normalized, the title trimmed.
pub fn validate_new(input: CreateBook) -> ApiResult<NewBook> {
    let title = input.title.trim().to_string();
    let len = title.chars().count();
    if !(1..=300).contains(&len) {
        return Err(ApiError::validation(
            "title must be between 1 and 300 characters",
        ));
    }
    if input.authors.len() > 20 {
        return Err(ApiError::validation("authors must have at most 20 entries"));
    }
    let mut authors = Vec::with_capacity(input.authors.len());
    for a in &input.authors {
        let a = a.trim();
        if !(1..=200).contains(&a.chars().count()) {
            return Err(ApiError::validation(
                "each author must be between 1 and 200 characters",
            ));
        }
        authors.push(a.to_string());
    }
    let isbn_13 = match &input.isbn_13 {
        Some(raw) => Some(
            normalize_isbn13(raw).ok_or_else(|| ApiError::validation("isbn_13 is not valid"))?,
        ),
        None => None,
    };
    let isbn_10 = match &input.isbn_10 {
        Some(raw) => Some(
            normalize_isbn10(raw).ok_or_else(|| ApiError::validation("isbn_10 is not valid"))?,
        ),
        None => None,
    };
    check_range("published_year", input.published_year, 1, 2100)?;
    check_range("page_count", input.page_count, 1, 50_000)?;
    check_range("price_cents", input.price_cents, 0, i64::MAX)?;
    check_range("progressive_number", input.progressive_number, 1, i64::MAX)?;
    if let Some(f) = &input.format {
        if !["hardcover", "paperback", "ebook", "audiobook"].contains(&f.as_str()) {
            return Err(ApiError::validation(
                "format must be hardcover, paperback, ebook or audiobook",
            ));
        }
    }
    check_text("subtitle", &input.subtitle, 300)?;
    check_text("publisher", &input.publisher, 300)?;
    check_text("genre", &input.genre, 300)?;
    check_text("condition", &input.condition, 300)?;
    check_text("language", &input.language, 35)?;
    check_text("description", &input.description, 10_000)?;
    check_text("notes", &input.notes, 10_000)?;
    Ok(NewBook {
        isbn_13,
        isbn_10,
        title,
        subtitle: input.subtitle,
        authors,
        publisher: input.publisher,
        published_year: input.published_year,
        language: input.language,
        page_count: input.page_count,
        description: input.description,
        genre: input.genre,
        format: input.format,
        progressive_number: input.progressive_number,
        condition: input.condition,
        acquired_at: input.acquired_at,
        price_cents: input.price_cents,
        notes: input.notes,
    })
}

/// `SELECT` of every `BookOut` column, without a `WHERE` clause.
pub const SELECT_BOOK: &str = "SELECT b.id, b.isbn_13, b.isbn_10, b.title, b.subtitle, \
    b.authors_json, b.publisher, b.published_year, b.language, b.page_count, b.description, \
    b.genre, b.format, b.progressive_number, b.condition, b.acquired_at, b.price_cents, b.notes, \
    b.cover_color, sb.shelf_id, sb.row_index, sb.slot_index, l.id IS NOT NULL, \
    b.created_at, b.updated_at \
    FROM books b \
    LEFT JOIN shelf_books sb ON sb.book_id = b.id \
    LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL";

/// Maps a row of [`SELECT_BOOK`].
pub fn map_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookOut> {
    let authors_json: String = row.get(5)?;
    let authors = serde_json::from_str(&authors_json).unwrap_or_default();
    let shelf_id: Option<String> = row.get(19)?;
    let placement = match shelf_id {
        Some(shelf_id) => Some(Placement {
            shelf_id,
            row_index: row.get(20)?,
            slot_index: row.get(21)?,
        }),
        None => None,
    };
    Ok(BookOut {
        id: row.get(0)?,
        isbn_13: row.get(1)?,
        isbn_10: row.get(2)?,
        title: row.get(3)?,
        subtitle: row.get(4)?,
        authors,
        publisher: row.get(6)?,
        published_year: row.get(7)?,
        language: row.get(8)?,
        page_count: row.get(9)?,
        description: row.get(10)?,
        genre: row.get(11)?,
        format: row.get(12)?,
        progressive_number: row.get(13)?,
        condition: row.get(14)?,
        acquired_at: row.get(15)?,
        price_cents: row.get(16)?,
        notes: row.get(17)?,
        cover_color: row.get(18)?,
        placement,
        on_loan: row.get(22)?,
        created_at: row.get(23)?,
        updated_at: row.get(24)?,
    })
}

/// Reads a book of the given library.
pub fn fetch(conn: &Connection, library_id: &str, id: &str) -> rusqlite::Result<Option<BookOut>> {
    conn.query_row(
        &format!("{SELECT_BOOK} WHERE b.library_id = ?1 AND b.id = ?2"),
        params![library_id, id],
        map_book,
    )
    .optional()
}

fn progressive_taken(
    conn: &Connection,
    library_id: &str,
    number: i64,
    except_id: Option<&str>,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM books WHERE library_id = ?1 AND progressive_number = ?2 \
         AND id IS NOT ?3)",
        params![library_id, number, except_id],
        |r| r.get(0),
    )
}

fn taken_error() -> ApiError {
    ApiError::conflict(
        "progressive_taken",
        "progressive_number is already used in this library",
    )
}

fn authors_json(authors: &[String]) -> String {
    serde_json::to_string(authors).unwrap_or_else(|_| "[]".to_string())
}

fn fts_insert(conn: &Connection, rowid: i64, b: &NewBook) -> rusqlite::Result<()> {
    let isbn = [b.isbn_13.as_deref(), b.isbn_10.as_deref()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    conn.execute(
        "INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            rowid,
            b.title,
            b.subtitle,
            b.authors.join(" "),
            b.description,
            b.notes,
            isbn
        ],
    )?;
    Ok(())
}

/// Inserts the book and its full-text row and records `book.create`.
/// The inner `Err` is a domain error (duplicate progressive number).
pub fn insert_in_tx(
    tx: &rusqlite::Transaction<'_>,
    who: &AuthUser,
    book: &NewBook,
    now: i64,
) -> rusqlite::Result<Result<String, ApiError>> {
    if let Some(n) = book.progressive_number {
        if progressive_taken(tx, &who.library_id, n, None)? {
            return Ok(Err(taken_error()));
        }
    }
    let id = new_id();
    tx.execute(
        "INSERT INTO books (id, library_id, isbn_13, isbn_10, title, subtitle, authors_json, \
         publisher, published_year, language, page_count, description, genre, format, \
         progressive_number, condition, acquired_at, price_cents, notes, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
         ?18, ?19, ?20, ?20)",
        params![
            id,
            who.library_id,
            book.isbn_13,
            book.isbn_10,
            book.title,
            book.subtitle,
            authors_json(&book.authors),
            book.publisher,
            book.published_year,
            book.language,
            book.page_count,
            book.description,
            book.genre,
            book.format,
            book.progressive_number,
            book.condition,
            book.acquired_at,
            book.price_cents,
            book.notes,
            now
        ],
    )?;
    fts_insert(tx, tx.last_insert_rowid(), book)?;
    audit::record(
        tx,
        who,
        "book.create",
        "book",
        &id,
        Some(&serde_json::json!({ "title": book.title })),
        now,
    )?;
    Ok(Ok(id))
}

#[utoipa::path(
    post,
    path = "/api/v1/books",
    tag = "books",
    security(("bearer" = [])),
    request_body = CreateBook,
    responses(
        (status = 201, description = "Created book", body = BookOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 409, description = "progressive_taken", body = ApiErrorBody),
        (status = 422, description = "Invalid body", body = ApiErrorBody),
    )
)]
pub async fn create_book(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<CreateBook>,
) -> ApiResult<(StatusCode, Json<BookOut>)> {
    who.require(Role::Member)?;
    let book = validate_new(body)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let id = match insert_in_tx(&tx, &who, &book, now_secs())? {
                Ok(id) => id,
                Err(e) => return Ok(Err(e)),
            };
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    get,
    path = "/api/v1/books/{id}",
    tag = "books",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "The book", body = BookOut),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
    )
)]
pub async fn get_book(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<BookOut>> {
    let book = state
        .db
        .run(move |conn| fetch(conn, &who.library_id, &id))
        .await?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(book))
}

fn merge(current: BookOut, p: PatchBook) -> ApiResult<CreateBook> {
    let title = match p.title {
        None => current.title,
        Some(Some(t)) => t,
        Some(None) => return Err(ApiError::validation("title cannot be null")),
    };
    Ok(CreateBook {
        isbn_13: p.isbn_13.unwrap_or(current.isbn_13),
        isbn_10: p.isbn_10.unwrap_or(current.isbn_10),
        title,
        subtitle: p.subtitle.unwrap_or(current.subtitle),
        authors: p.authors.map_or(current.authors, Option::unwrap_or_default),
        publisher: p.publisher.unwrap_or(current.publisher),
        published_year: p.published_year.unwrap_or(current.published_year),
        language: p.language.unwrap_or(current.language),
        page_count: p.page_count.unwrap_or(current.page_count),
        description: p.description.unwrap_or(current.description),
        genre: p.genre.unwrap_or(current.genre),
        format: p.format.unwrap_or(current.format),
        progressive_number: p.progressive_number.unwrap_or(current.progressive_number),
        condition: p.condition.unwrap_or(current.condition),
        acquired_at: p.acquired_at.unwrap_or(current.acquired_at),
        price_cents: p.price_cents.unwrap_or(current.price_cents),
        notes: p.notes.unwrap_or(current.notes),
    })
}

#[utoipa::path(
    patch,
    path = "/api/v1/books/{id}",
    tag = "books",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = PatchBook,
    responses(
        (status = 200, description = "Updated book", body = BookOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
        (status = 409, description = "progressive_taken", body = ApiErrorBody),
        (status = 422, description = "Invalid body", body = ApiErrorBody),
    )
)]
pub async fn patch_book(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(patch): ApiJson<PatchBook>,
) -> ApiResult<Json<BookOut>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(current) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let old_updated = current.updated_at;
            let book = match merge(current, patch).and_then(validate_new) {
                Ok(b) => b,
                Err(e) => return Ok(Err(e)),
            };
            if let Some(n) = book.progressive_number {
                if progressive_taken(&tx, &who.library_id, n, Some(&id))? {
                    return Ok(Err(taken_error()));
                }
            }
            // Never leave `updated_at` unchanged, even within the same second.
            let now = now_secs().max(old_updated + 1);
            tx.execute(
                "UPDATE books SET isbn_13 = ?1, isbn_10 = ?2, title = ?3, subtitle = ?4, \
                 authors_json = ?5, publisher = ?6, published_year = ?7, language = ?8, \
                 page_count = ?9, description = ?10, genre = ?11, format = ?12, \
                 progressive_number = ?13, condition = ?14, acquired_at = ?15, price_cents = ?16, \
                 notes = ?17, updated_at = ?18 WHERE id = ?19 AND library_id = ?20",
                params![
                    book.isbn_13,
                    book.isbn_10,
                    book.title,
                    book.subtitle,
                    authors_json(&book.authors),
                    book.publisher,
                    book.published_year,
                    book.language,
                    book.page_count,
                    book.description,
                    book.genre,
                    book.format,
                    book.progressive_number,
                    book.condition,
                    book.acquired_at,
                    book.price_cents,
                    book.notes,
                    now,
                    id,
                    who.library_id
                ],
            )?;
            let rowid: i64 =
                tx.query_row("SELECT rowid FROM books WHERE id = ?1", [&id], |r| r.get(0))?;
            tx.execute("DELETE FROM books_fts WHERE rowid = ?1", [rowid])?;
            fts_insert(&tx, rowid, &book)?;
            audit::record(&tx, &who, "book.update", "book", &id, None, now)?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

/// Deletes a book of the library with its full-text row; false when absent.
fn delete_one(
    tx: &rusqlite::Transaction<'_>,
    who: &AuthUser,
    id: &str,
    now: i64,
) -> rusqlite::Result<bool> {
    let rowid: Option<i64> = tx
        .query_row(
            "SELECT rowid FROM books WHERE id = ?1 AND library_id = ?2",
            params![id, who.library_id],
            |r| r.get(0),
        )
        .optional()?;
    let Some(rowid) = rowid else {
        return Ok(false);
    };
    tx.execute("DELETE FROM books_fts WHERE rowid = ?1", [rowid])?;
    tx.execute("DELETE FROM books WHERE rowid = ?1", [rowid])?;
    audit::record(tx, who, "book.delete", "book", id, None, now)?;
    Ok(true)
}

#[utoipa::path(
    delete,
    path = "/api/v1/books/{id}",
    tag = "books",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
    )
)]
pub async fn delete_book(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    let found = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let found = delete_one(&tx, &who, &id, now_secs())?;
            tx.commit()?;
            Ok(found)
        })
        .await?;
    if found {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found())
    }
}

#[utoipa::path(
    post,
    path = "/api/v1/books/batch-delete",
    tag = "books",
    security(("bearer" = [])),
    request_body = BatchDelete,
    responses(
        (status = 200, description = "Number of books deleted", body = BatchDeleted),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 422, description = "More than 500 ids", body = ApiErrorBody),
    )
)]
pub async fn batch_delete(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<BatchDelete>,
) -> ApiResult<Json<BatchDeleted>> {
    who.require(Role::Member)?;
    if body.ids.len() > 500 {
        return Err(ApiError::validation("at most 500 ids per request"));
    }
    let deleted = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let now = now_secs();
            let mut deleted = 0;
            for id in &body.ids {
                if delete_one(&tx, &who, id, now)? {
                    deleted += 1;
                }
            }
            tx.commit()?;
            Ok(deleted)
        })
        .await?;
    Ok(Json(BatchDeleted { deleted }))
}

#[utoipa::path(
    get,
    path = "/api/v1/books/next-progressive",
    tag = "books",
    security(("bearer" = [])),
    responses((status = 200, description = "Highest progressive number plus one, or 1", body = NextProgressive))
)]
pub async fn next_progressive(
    State(state): State<AppState>,
    who: AuthUser,
) -> ApiResult<Json<NextProgressive>> {
    let next = state
        .db
        .run(move |conn| {
            conn.query_row(
                "SELECT COALESCE(MAX(progressive_number), 0) + 1 FROM books WHERE library_id = ?1",
                [&who.library_id],
                |r| r.get(0),
            )
        })
        .await?;
    Ok(Json(NextProgressive { next }))
}
