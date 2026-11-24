//! `POST /import` and `GET /export`.
use std::collections::{HashMap, HashSet};

use axum::{
    extract::{DefaultBodyLimit, State},
    response::Response,
    routing::{get, post},
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::{
        books::{insert_in_tx_unaudited, map_book, validate_new, CreateBook, SELECT_BOOK},
        util::{download, now_secs, ApiQuery},
    },
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    import::{self, Format, ImportedBook, RequestFormat},
    state::AppState,
};

/// Largest accepted body of `POST /import`.
const IMPORT_BODY_LIMIT: usize = 10 * 1024 * 1024;
const MAX_PREVIEW: usize = 20;
const MAX_ERRORS: usize = 50;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route(
            "/api/v1/import",
            post(import_books).layer(DefaultBodyLimit::max(IMPORT_BODY_LIMIT)),
        )
        .route("/api/v1/export", get(export_books))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(import_books, export_books),
    components(schemas(
        ImportRequest,
        ImportReport,
        ImportRowError,
        ImportedBook,
        RequestFormat,
        ExportJson,
        ExportLibrary,
        ExportBook
    ))
)]
pub struct Doc;

#[derive(Debug, Deserialize, ToSchema)]
pub struct ImportRequest {
    /// `auto` (default), `goodreads`, `calibre` or `librarything`.
    #[serde(default = "default_format")]
    pub format: RequestFormat,
    /// The whole file as text, up to 10 MB.
    pub content: String,
    #[serde(default)]
    pub dry_run: bool,
}

fn default_format() -> RequestFormat {
    RequestFormat::Auto
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ImportRowError {
    /// Line of the file where the record starts.
    pub row: u64,
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ImportReport {
    pub format: String,
    pub total: i64,
    pub new: i64,
    pub duplicates: i64,
    pub invalid: i64,
    /// The first 20 new books.
    pub preview: Vec<ImportedBook>,
    /// The first 50 invalid rows.
    pub errors: Vec<ImportRowError>,
}

fn imported_from(b: &crate::api::books::NewBook) -> ImportedBook {
    ImportedBook {
        title: b.title.clone(),
        authors: b.authors.clone(),
        isbn_13: b.isbn_13.clone(),
        isbn_10: b.isbn_10.clone(),
        publisher: b.publisher.clone(),
        published_year: b.published_year,
        page_count: b.page_count,
        language: b.language.clone(),
        format: b.format.clone(),
        notes: b.notes.clone(),
    }
}

/// Imports books from a Goodreads, Calibre or LibraryThing export (admin).
///
/// With `dry_run` nothing is written. Otherwise all new rows go in one transaction
/// and one `library.import` audit row is written.
#[utoipa::path(
    post,
    path = "/api/v1/import",
    tag = "transfer",
    security(("bearer" = [])),
    request_body = ImportRequest,
    responses(
        (status = 200, description = "Import report", body = ImportReport),
        (status = 403, description = "Admin only", body = ApiErrorBody),
        (status = 413, description = "Body over 10 MB", body = ApiErrorBody),
        (status = 422, description = "Unknown format or too many rows", body = ApiErrorBody),
    )
)]
pub async fn import_books(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<ImportRequest>,
) -> ApiResult<axum::Json<ImportReport>> {
    who.require(Role::Admin)?;
    let report = state
        .db
        .run(move |conn| {
            let format = match body.format {
                RequestFormat::Goodreads => Format::Goodreads,
                RequestFormat::Calibre => Format::Calibre,
                RequestFormat::Librarything => Format::LibraryThing,
                RequestFormat::Auto => match import::detect(&body.content) {
                    Some(f) => f,
                    None => {
                        return Ok(Err(ApiError::validation(
                            "Could not recognize the file format from its headers",
                        )))
                    }
                },
            };
            let rows = match import::parse(format, &body.content) {
                Ok(r) => r,
                Err(e) => return Ok(Err(e)),
            };
            let dry_run = body.dry_run;
            drop(body);

            let mut known: HashSet<String> = HashSet::new();
            {
                let mut stmt =
                    conn.prepare("SELECT isbn_13, isbn_10 FROM books WHERE library_id = ?1")?;
                let found = stmt.query_map([&who.library_id], |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?,
                        r.get::<_, Option<String>>(1)?,
                    ))
                })?;
                for pair in found {
                    let (a, b) = pair?;
                    known.extend(a.into_iter().chain(b).filter(|s| !s.is_empty()));
                }
            }

            let mut report = ImportReport {
                format: format.as_str().to_string(),
                total: rows.len() as i64,
                new: 0,
                duplicates: 0,
                invalid: 0,
                preview: Vec::new(),
                errors: Vec::new(),
            };
            let mut to_insert = Vec::new();
            for r in rows {
                let b = r.book;
                let create = CreateBook {
                    isbn_13: b.isbn_13,
                    isbn_10: b.isbn_10,
                    title: b.title,
                    authors: b.authors,
                    publisher: b.publisher,
                    published_year: b.published_year,
                    page_count: b.page_count,
                    language: b.language,
                    format: b.format,
                    notes: b.notes,
                    ..CreateBook::default()
                };
                let book = match validate_new(create) {
                    Ok(b) => b,
                    Err(e) => {
                        report.invalid += 1;
                        if report.errors.len() < MAX_ERRORS {
                            report.errors.push(ImportRowError {
                                row: r.row,
                                message: e.message,
                            });
                        }
                        continue;
                    }
                };
                let key = book.isbn_13.clone().or_else(|| book.isbn_10.clone());
                if let Some(key) = key {
                    // `known` also grows with this file's rows: duplicates within the file.
                    if !known.insert(key) {
                        report.duplicates += 1;
                        continue;
                    }
                }
                report.new += 1;
                if report.preview.len() < MAX_PREVIEW {
                    report.preview.push(imported_from(&book));
                }
                to_insert.push(book);
            }

            if !dry_run {
                let now = now_secs();
                let tx = conn.transaction()?;
                for book in &to_insert {
                    if let Err(e) = insert_in_tx_unaudited(&tx, &who.library_id, book, now)? {
                        return Ok(Err(e));
                    }
                }
                audit::record(
                    &tx,
                    &who,
                    "library.import",
                    "library",
                    &who.library_id,
                    Some(&serde_json::json!({
                        "format": report.format,
                        "new": report.new,
                        "duplicates": report.duplicates,
                        "invalid": report.invalid,
                    })),
                    now,
                )?;
                tx.commit()?;
            }
            Ok(Ok(report))
        })
        .await??;
    Ok(axum::Json(report))
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    format: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ExportLibrary {
    pub id: String,
    pub name: String,
}

/// A book in the JSON export: `BookOut` without `placement` and `on_loan`,
/// plus the shelf name and the 0-based row and slot.
#[derive(Debug, Serialize, ToSchema)]
pub struct ExportBook {
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
    pub format: Option<String>,
    pub progressive_number: Option<i64>,
    pub condition: Option<String>,
    pub acquired_at: Option<i64>,
    pub price_cents: Option<i64>,
    pub notes: Option<String>,
    pub cover_color: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub shelf_name: Option<String>,
    pub row_index: Option<i64>,
    pub slot_index: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ExportJson {
    pub exported_at: String,
    pub library: ExportLibrary,
    pub books: Vec<ExportBook>,
}

const CSV_HEADER: [&str; 19] = [
    "title",
    "subtitle",
    "authors",
    "isbn_13",
    "isbn_10",
    "publisher",
    "published_year",
    "language",
    "page_count",
    "genre",
    "format",
    "progressive_number",
    "condition",
    "acquired_at",
    "price_cents",
    "notes",
    "shelf",
    "row",
    "slot",
];

/// Prefixes cells a spreadsheet would run as formulas with an apostrophe.
fn safe_cell(s: &str) -> String {
    if s.starts_with(['=', '+', '-', '@']) {
        format!("'{s}")
    } else {
        s.to_string()
    }
}

fn num(n: Option<i64>) -> String {
    n.map(|v| v.to_string()).unwrap_or_default()
}

fn to_csv(books: &[ExportBook]) -> Result<Vec<u8>, csv::Error> {
    let mut w = csv::Writer::from_writer(Vec::new());
    w.write_record(CSV_HEADER)?;
    for b in books {
        let text = |o: &Option<String>| safe_cell(o.as_deref().unwrap_or(""));
        w.write_record([
            safe_cell(&b.title),
            text(&b.subtitle),
            safe_cell(&b.authors.join("; ")),
            text(&b.isbn_13),
            text(&b.isbn_10),
            text(&b.publisher),
            num(b.published_year),
            text(&b.language),
            num(b.page_count),
            text(&b.genre),
            text(&b.format),
            num(b.progressive_number),
            text(&b.condition),
            num(b.acquired_at),
            num(b.price_cents),
            text(&b.notes),
            text(&b.shelf_name),
            num(b.row_index),
            num(b.slot_index),
        ])?;
    }
    w.into_inner().map_err(|e| e.into_error().into())
}

/// Downloads the whole library as JSON or CSV (member or higher).
#[utoipa::path(
    get,
    path = "/api/v1/export",
    tag = "transfer",
    security(("bearer" = [])),
    params(("format" = Option<String>, Query, description = "`json` (default) or `csv`")),
    responses(
        (status = 200, description = "File to download (JSON body is ExportJson)", content_type = "application/octet-stream", body = Vec<u8>),
        (status = 403, description = "Guests cannot export", body = ApiErrorBody),
        (status = 422, description = "Unknown format", body = ApiErrorBody),
    )
)]
pub async fn export_books(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<ExportQuery>,
) -> ApiResult<Response> {
    who.require(Role::Member)?;
    let csv_out = match q.format.as_deref().unwrap_or("json") {
        "json" => false,
        "csv" => true,
        _ => return Err(ApiError::validation("format must be json or csv")),
    };
    let library_id = who.library_id.clone();
    let (name, books) = state
        .db
        .run(move |conn| {
            let name: String = conn.query_row(
                "SELECT name FROM libraries WHERE id = ?1",
                [&library_id],
                |r| r.get(0),
            )?;
            let shelves: HashMap<String, String> = {
                let mut stmt =
                    conn.prepare("SELECT id, name FROM shelves WHERE library_id = ?1")?;
                let rows = stmt.query_map([&library_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
                rows.collect::<rusqlite::Result<_>>()?
            };
            let mut stmt = conn.prepare(&format!(
                "{SELECT_BOOK} WHERE b.library_id = ?1 \
                 ORDER BY COALESCE(b.progressive_number, 9223372036854775807), b.created_at, b.id"
            ))?;
            let books = stmt
                .query_map(params![library_id], map_book)?
                .map(|b| {
                    b.map(|b| {
                        let (shelf_name, row_index, slot_index) = match &b.placement {
                            Some(p) => (
                                shelves.get(&p.shelf_id).cloned(),
                                Some(p.row_index),
                                Some(p.slot_index),
                            ),
                            None => (None, None, None),
                        };
                        ExportBook {
                            id: b.id,
                            isbn_13: b.isbn_13,
                            isbn_10: b.isbn_10,
                            title: b.title,
                            subtitle: b.subtitle,
                            authors: b.authors,
                            publisher: b.publisher,
                            published_year: b.published_year,
                            language: b.language,
                            page_count: b.page_count,
                            description: b.description,
                            genre: b.genre,
                            format: b.format,
                            progressive_number: b.progressive_number,
                            condition: b.condition,
                            acquired_at: b.acquired_at,
                            price_cents: b.price_cents,
                            notes: b.notes,
                            cover_color: b.cover_color,
                            created_at: b.created_at,
                            updated_at: b.updated_at,
                            shelf_name,
                            row_index,
                            slot_index,
                        }
                    })
                })
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok((name, books))
        })
        .await?;
    let now = chrono::Utc::now();
    let stem = format!("bookeeper-{name}-{}", now.format("%Y%m%d"));
    if csv_out {
        let bytes = tokio::task::spawn_blocking(move || to_csv(&books))
            .await
            .map_err(|_| ApiError::internal())?
            .map_err(|e| {
                tracing::error!(error = %e, "csv export failed");
                ApiError::internal()
            })?;
        Ok(download(
            bytes,
            "text/csv; charset=utf-8",
            &format!("{stem}.csv"),
        ))
    } else {
        let doc = ExportJson {
            exported_at: now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            library: ExportLibrary {
                id: who.library_id,
                name,
            },
            books,
        };
        let bytes = serde_json::to_vec(&doc).map_err(|_| ApiError::internal())?;
        Ok(download(bytes, "application/json", &format!("{stem}.json")))
    }
}
