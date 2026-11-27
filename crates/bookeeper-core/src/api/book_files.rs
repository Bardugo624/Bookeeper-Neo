//! The e-book files attached to a book: attach, list, download, detach.
use std::io::SeekFrom;
use std::path::Path as FsPath;

use axum::{
    body::{Body, Bytes},
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use unicode_normalization::UnicodeNormalization;
use utoipa::ToSchema;

use crate::{
    api::{
        covers as cover_api,
        ebook_files::find_stored,
        util::{new_id, now_secs, PersonRef},
    },
    audit,
    auth::{guard::AuthUser, Role},
    covers,
    ebooks::{self, EbookFormat},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route(
            "/api/v1/books/{id}/files",
            get(list_files).post(attach_file),
        )
        .route(
            "/api/v1/books/{id}/files/{file_id}",
            axum::routing::delete(detach_file),
        )
        .route(
            "/api/v1/books/{id}/files/{file_id}/content",
            get(download_file),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(attach_file, list_files, download_file, detach_file),
    components(schemas(AttachFile, BookFileOut))
)]
pub struct Doc;

/// Body of `POST /books/{id}/files`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct AttachFile {
    /// SHA-256 of a file uploaded with `PUT /ebook-files`.
    pub sha256: String,
    /// Original file name, for display.
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BookFileOut {
    pub id: String,
    pub book_id: String,
    /// `epub`, `pdf`, `mobi`, `azw3`, `fb2` or `cbz`.
    pub format: String,
    pub size_bytes: i64,
    pub name: String,
    pub created_at: i64,
    pub uploaded_by: Option<PersonRef>,
    /// True when the file is not on the server's disk any more.
    pub missing: bool,
}

const FILE_COLS: &str = "bf.id, bf.book_id, bf.format, bf.size_bytes, bf.original_name, \
    bf.created_at, u.id, u.display_name, bf.sha256";
const FILE_FROM: &str = "FROM book_files bf \
    LEFT JOIN users u ON u.id = bf.uploaded_by AND u.library_id = bf.library_id";

/// A row of [`FILE_COLS`] with the hash the response does not show.
struct FileRow {
    out: BookFileOut,
    sha256: String,
}

fn map_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
    Ok(FileRow {
        out: BookFileOut {
            id: row.get(0)?,
            book_id: row.get(1)?,
            format: row.get(2)?,
            size_bytes: row.get(3)?,
            name: row.get(4)?,
            created_at: row.get(5)?,
            uploaded_by: PersonRef::from_row(row, 6)?,
            missing: false,
        },
        sha256: row.get(8)?,
    })
}

fn path_of(dir: &FsPath, row: &FileRow) -> Option<std::path::PathBuf> {
    let format = EbookFormat::parse(&row.out.format)?;
    ebooks::ebook_path(dir, &row.sha256, format)
}

fn book_exists(conn: &rusqlite::Connection, library_id: &str, id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM books WHERE id = ?1 AND library_id = ?2)",
        params![id, library_id],
        |r| r.get(0),
    )
}

/// Deletes from disk the stored files in `files` (sha256, format) that no row
/// of `book_files` uses any more. Call after the rows are gone; failures are logged.
pub fn remove_unused(conn: &rusqlite::Connection, dir: &FsPath, files: &[(String, String)]) {
    for (sha256, format) in files {
        let used: rusqlite::Result<bool> = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM book_files WHERE sha256 = ?1)",
            [sha256],
            |r| r.get(0),
        );
        if used.unwrap_or(true) {
            continue;
        }
        let Some(path) =
            EbookFormat::parse(format).and_then(|f| ebooks::ebook_path(dir, sha256, f))
        else {
            continue;
        };
        if let Err(e) = std::fs::remove_file(&path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(error = %e, "cannot delete e-book file");
            }
        }
    }
}

enum Attached {
    NoBook,
    NoFile,
    Duplicate,
    Done(Box<BookFileOut>, bool),
}

/// Attach a file already uploaded with `PUT /ebook-files` to a book. If the
/// book has no cover and the file has one, the cover goes to the book.
#[utoipa::path(
    post,
    path = "/api/v1/books/{id}/files",
    tag = "ebooks",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    request_body = AttachFile,
    responses(
        (status = 201, description = "Attached", body = BookFileOut),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or file", body = ApiErrorBody),
        (status = 409, description = "file_already_attached", body = ApiErrorBody),
    )
)]
pub async fn attach_file(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<AttachFile>,
) -> ApiResult<(StatusCode, Json<BookFileOut>)> {
    who.require(Role::Member)?;
    let name = body.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 255 {
        return Err(ApiError::validation("name must hold 1 to 255 characters"));
    }
    let sha256 = body.sha256.trim().to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::validation("sha256 must be 64 hexadecimal digits"));
    }
    let dir = state.files.ebooks_dir.clone();
    let (path, format) = find_stored(&dir, &sha256).ok_or_else(ApiError::not_found)?;
    let (hash_path, size) = (path.clone(), std::fs::metadata(&path).map(|m| m.len()));
    let size = size.map_err(|_| ApiError::not_found())?;
    let koreader = tokio::task::spawn_blocking(move || ebooks::partial_md5(&hash_path))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|_| ApiError::not_found())?;

    let (who2, id2, dir2) = (who.clone(), id.clone(), dir.clone());
    let res = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if !book_exists(&tx, &who2.library_id, &id2)? {
                return Ok(Attached::NoBook);
            }
            // Checked here, in the one connection, so a concurrent detach
            // cannot delete the file between the check and the insert.
            if !path.is_file() {
                return Ok(Attached::NoFile);
            }
            let dup: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM book_files WHERE book_id = ?1 AND sha256 = ?2)",
                params![id2, sha256],
                |r| r.get(0),
            )?;
            if dup {
                return Ok(Attached::Duplicate);
            }
            let file_id = new_id();
            let now = now_secs();
            tx.execute(
                "INSERT INTO book_files (id, library_id, book_id, format, sha256, size_bytes, \
                 original_name, koreader_hash, uploaded_by, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    file_id,
                    who2.library_id,
                    id2,
                    format.as_str(),
                    sha256,
                    i64::try_from(size).unwrap_or(i64::MAX),
                    name,
                    koreader,
                    who2.user_id,
                    now
                ],
            )?;
            tx.execute(
                "UPDATE books SET updated_at = ?1 WHERE id = ?2",
                params![now, id2],
            )?;
            let detail = serde_json::json!({ "format": format.as_str(), "name": name });
            audit::record(
                &tx,
                &who2,
                "book.file.add",
                "book",
                &id2,
                Some(&detail),
                now,
            )?;
            let row = tx.query_row(
                &format!("SELECT {FILE_COLS} {FILE_FROM} WHERE bf.id = ?1"),
                [&file_id],
                map_file,
            )?;
            let no_cover: bool = tx.query_row(
                "SELECT cover_file IS NULL FROM books WHERE id = ?1",
                [&id2],
                |r| r.get(0),
            )?;
            tx.commit()?;
            Ok(Attached::Done(Box::new(row.out), no_cover))
        })
        .await?;
    let (out, no_cover) = match res {
        Attached::NoBook | Attached::NoFile => return Err(ApiError::not_found()),
        Attached::Duplicate => {
            return Err(ApiError::conflict(
                "file_already_attached",
                "This file is already attached to the book",
            ))
        }
        Attached::Done(out, no_cover) => (*out, no_cover),
    };
    if no_cover {
        pass_cover(&state, who, &id, &dir2, &out.format, &body.sha256).await;
    }
    Ok((StatusCode::CREATED, Json(out)))
}

/// Gives the book the cover of the file, with the logic of the cover routes.
/// Best effort: a file without a usable cover leaves the book as it was.
async fn pass_cover(
    state: &AppState,
    who: AuthUser,
    book_id: &str,
    dir: &FsPath,
    format: &str,
    sha256: &str,
) {
    let Some(path) = EbookFormat::parse(format)
        .and_then(|f| ebooks::ebook_path(dir, &sha256.trim().to_ascii_lowercase(), f))
    else {
        return;
    };
    let format = EbookFormat::parse(format).unwrap_or(EbookFormat::Epub);
    let processed = tokio::task::spawn_blocking(move || {
        let bytes = ebooks::extract_cover(&path, format)?;
        covers::process(&bytes).ok()
    })
    .await
    .ok()
    .flatten();
    let Some(processed) = processed else {
        return;
    };
    let detail = serde_json::json!({ "source": "ebook" });
    if let Err(e) = cover_api::store(state, who, book_id.to_string(), processed, Some(detail)).await
    {
        tracing::warn!(status = %e.status, "cannot give the book the cover of its file");
    }
}

/// The files attached to a book, oldest first.
#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/files",
    tag = "ebooks",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Book id")),
    responses(
        (status = 200, description = "Files of the book", body = Vec<BookFileOut>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book", body = ApiErrorBody),
    )
)]
pub async fn list_files(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<BookFileOut>>> {
    who.require(Role::Member)?;
    let dir = state.files.ebooks_dir.clone();
    let rows = state
        .db
        .run(move |conn| {
            if !book_exists(conn, &who.library_id, &id)? {
                return Ok(None);
            }
            let mut stmt = conn.prepare(&format!(
                "SELECT {FILE_COLS} {FILE_FROM} WHERE bf.book_id = ?1 AND bf.library_id = ?2 \
                 ORDER BY bf.created_at, bf.id"
            ))?;
            let rows = stmt
                .query_map(params![id, who.library_id], map_file)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(Some(rows))
        })
        .await?
        .ok_or_else(ApiError::not_found)?;
    let out = tokio::task::spawn_blocking(move || {
        rows.into_iter()
            .map(|mut r| {
                r.out.missing = !path_of(&dir, &r).is_some_and(|p| p.is_file());
                r.out
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|_| ApiError::internal())?;
    Ok(Json(out))
}

/// Takes the file off the book. The file on disk goes too, unless another book uses it.
#[utoipa::path(
    delete,
    path = "/api/v1/books/{id}/files/{file_id}",
    tag = "ebooks",
    security(("bearer" = [])),
    params(
        ("id" = String, Path, description = "Book id"),
        ("file_id" = String, Path, description = "File id"),
    ),
    responses(
        (status = 204, description = "Removed"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or file", body = ApiErrorBody),
    )
)]
pub async fn detach_file(
    State(state): State<AppState>,
    who: AuthUser,
    Path((id, file_id)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    let dir = state.files.ebooks_dir.clone();
    let found = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let row = tx
                .query_row(
                    &format!(
                        "SELECT {FILE_COLS} {FILE_FROM} \
                         WHERE bf.id = ?1 AND bf.book_id = ?2 AND bf.library_id = ?3"
                    ),
                    params![file_id, id, who.library_id],
                    map_file,
                )
                .optional()?;
            let Some(row) = row else {
                return Ok(false);
            };
            let now = now_secs();
            tx.execute("DELETE FROM book_files WHERE id = ?1", [&file_id])?;
            tx.execute(
                "UPDATE books SET updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
            let detail = serde_json::json!({ "format": row.out.format, "name": row.out.name });
            audit::record(
                &tx,
                &who,
                "book.file.remove",
                "book",
                &id,
                Some(&detail),
                now,
            )?;
            tx.commit()?;
            remove_unused(conn, &dir, &[(row.sha256, row.out.format)]);
            Ok(true)
        })
        .await?;
    if found {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found())
    }
}

// ------------------------------------------------------------------ download

/// What a `Range` header asks for.
#[derive(Debug, PartialEq, Eq)]
enum Wanted {
    /// No usable `Range`: the whole file.
    Whole,
    /// First and last byte, both included.
    Part(u64, u64),
    Unsatisfiable,
}

/// A single `bytes=` range. Anything else (another unit, several ranges, bad
/// syntax) is ignored, as the RFC allows, and the whole file is sent.
fn parse_range(value: &str, size: u64) -> Wanted {
    let Some(spec) = value.trim().strip_prefix("bytes=") else {
        return Wanted::Whole;
    };
    if spec.contains(',') {
        return Wanted::Whole;
    }
    let Some((a, b)) = spec.trim().split_once('-') else {
        return Wanted::Whole;
    };
    let (a, b) = (a.trim(), b.trim());
    let num = |s: &str| s.bytes().all(|c| c.is_ascii_digit()) && !s.is_empty();
    if a.is_empty() {
        // Suffix: the last `n` bytes.
        if !num(b) {
            return Wanted::Whole;
        }
        let Ok(n) = b.parse::<u64>() else {
            return Wanted::Whole;
        };
        if n == 0 || size == 0 {
            return Wanted::Unsatisfiable;
        }
        return Wanted::Part(size.saturating_sub(n), size - 1);
    }
    if !num(a) || !(b.is_empty() || num(b)) {
        return Wanted::Whole;
    }
    let (Ok(start), end) = (a.parse::<u64>(), b.parse::<u64>()) else {
        return Wanted::Whole;
    };
    if b.is_empty() {
        return if start >= size {
            Wanted::Unsatisfiable
        } else {
            Wanted::Part(start, size - 1)
        };
    }
    let Ok(end) = end else {
        return Wanted::Whole;
    };
    if end < start {
        return Wanted::Whole;
    }
    if start >= size {
        return Wanted::Unsatisfiable;
    }
    Wanted::Part(start, end.min(size - 1))
}

/// Letters and digits stay; what a file system or a header cannot carry becomes `_`.
fn clean_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    cleaned.trim().chars().take(150).collect()
}

/// `Autore - Titolo.ext`, without the author when there is none.
fn download_name(authors: &[String], title: &str, ext: &str) -> String {
    let title = clean_name(title);
    let title = if title.is_empty() {
        "book".to_string()
    } else {
        title
    };
    let authors = clean_name(&authors.join(", "));
    if authors.is_empty() {
        format!("{title}.{ext}")
    } else {
        format!("{authors} - {title}.{ext}")
    }
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"!#$&+-.^_`|~".contains(&b) {
            out.push(char::from(b));
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The `Content-Disposition` value: `filename*` in UTF-8 and an ASCII `filename`.
fn disposition(name: &str) -> String {
    let ascii: String = name
        .nfkd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .map(|c| if c.is_ascii() { c } else { '_' })
        .collect();
    format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        ascii.replace(['"', '\\'], "_"),
        percent_encode(name)
    )
}

const CHUNK: usize = 64 * 1024;

/// Streams `len` bytes of `file`, in chunks, from where it is positioned.
fn file_body(file: tokio::fs::File, len: u64) -> Body {
    let stream = futures_util::stream::unfold((file, len), |(mut file, left)| async move {
        if left == 0 {
            return None;
        }
        let want = usize::try_from(left).unwrap_or(CHUNK).min(CHUNK);
        let mut buf = vec![0u8; want];
        match file.read(&mut buf).await {
            Ok(0) => Some((
                Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof)),
                (file, 0),
            )),
            Ok(n) => {
                buf.truncate(n);
                Some((
                    Ok::<_, std::io::Error>(Bytes::from(buf)),
                    (file, left - n as u64),
                ))
            }
            Err(e) => Some((Err(e), (file, 0))),
        }
    });
    Body::from_stream(stream)
}

fn missing_file() -> ApiError {
    ApiError::coded(
        StatusCode::NOT_FOUND,
        "file_missing",
        "The file is not on the server's disk",
    )
}

/// The file, streamed. It answers `Range` requests: 206 with `Content-Range`, or 416.
#[utoipa::path(
    get,
    path = "/api/v1/books/{id}/files/{file_id}/content",
    tag = "ebooks",
    security(("bearer" = [])),
    params(
        ("id" = String, Path, description = "Book id"),
        ("file_id" = String, Path, description = "File id"),
        ("Range" = Option<String>, Header, description = "A single byte range, for example `bytes=0-99`"),
    ),
    responses(
        (status = 200, description = "The whole file", content_type = "application/octet-stream", body = Vec<u8>),
        (status = 206, description = "Part of the file", content_type = "application/octet-stream", body = Vec<u8>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown book or file; file_missing: not on disk", body = ApiErrorBody),
        (status = 416, description = "range_not_satisfiable", body = ApiErrorBody),
    )
)]
pub async fn download_file(
    State(state): State<AppState>,
    who: AuthUser,
    Path((id, file_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    who.require(Role::Member)?;
    let (row, title, authors_json) = state
        .db
        .run(move |conn| {
            conn.query_row(
                &format!(
                    "SELECT {FILE_COLS}, b.title, b.authors_json {FILE_FROM} \
                     JOIN books b ON b.id = bf.book_id \
                     WHERE bf.id = ?1 AND bf.book_id = ?2 AND bf.library_id = ?3"
                ),
                params![file_id, id, who.library_id],
                |r| {
                    Ok((
                        map_file(r)?,
                        r.get::<_, String>(9)?,
                        r.get::<_, String>(10)?,
                    ))
                },
            )
            .optional()
        })
        .await?
        .ok_or_else(ApiError::not_found)?;
    let format = EbookFormat::parse(&row.out.format).ok_or_else(ApiError::internal)?;
    let path = path_of(&state.files.ebooks_dir, &row).ok_or_else(ApiError::internal)?;
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            missing_file()
        } else {
            ApiError::internal()
        }
    })?;
    let size = file
        .metadata()
        .await
        .map_err(|_| ApiError::internal())?
        .len();

    let etag = format!("\"{}\"", row.sha256);
    // `If-Range` with a validator that is not ours means: send it all.
    let if_range_ok = headers
        .get(header::IF_RANGE)
        .is_none_or(|v| v.to_str().is_ok_and(|v| v.trim() == etag));
    let wanted = match headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        Some(v) if if_range_ok => parse_range(v, size),
        _ => Wanted::Whole,
    };

    let authors: Vec<String> = serde_json::from_str(&authors_json).unwrap_or_default();
    let name = download_name(&authors, &title, format.ext());
    let mut resp = Response::builder()
        .header(header::CONTENT_TYPE, format.mime())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ETAG, &etag)
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .header(header::CONTENT_DISPOSITION, disposition(&name));
    let (status, start, len) = match wanted {
        Wanted::Whole => (StatusCode::OK, 0, size),
        Wanted::Part(a, b) => {
            resp = resp.header(header::CONTENT_RANGE, format!("bytes {a}-{b}/{size}"));
            (StatusCode::PARTIAL_CONTENT, a, b - a + 1)
        }
        Wanted::Unsatisfiable => {
            let mut resp = ApiError::coded(
                StatusCode::RANGE_NOT_SATISFIABLE,
                "range_not_satisfiable",
                "The requested range is outside the file",
            )
            .into_response();
            if let Ok(v) = HeaderValue::from_str(&format!("bytes */{size}")) {
                resp.headers_mut().insert(header::CONTENT_RANGE, v);
            }
            return Ok(resp);
        }
    };
    if start > 0 {
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| ApiError::internal())?;
    }
    resp.status(status)
        .header(header::CONTENT_LENGTH, HeaderValue::from(len))
        .body(file_body(file, len))
        .map_err(|_| ApiError::internal())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Wanted::Part(0, 99));
        assert_eq!(parse_range("bytes=900-", 1000), Wanted::Part(900, 999));
        assert_eq!(parse_range("bytes=990-5000", 1000), Wanted::Part(990, 999));
        assert_eq!(parse_range("bytes=-100", 1000), Wanted::Part(900, 999));
        assert_eq!(parse_range("bytes=-5000", 1000), Wanted::Part(0, 999));
        assert_eq!(parse_range("bytes=1000-", 1000), Wanted::Unsatisfiable);
        assert_eq!(parse_range("bytes=2000-3000", 1000), Wanted::Unsatisfiable);
        assert_eq!(parse_range("bytes=-0", 1000), Wanted::Unsatisfiable);
        assert_eq!(parse_range("bytes=0-0", 0), Wanted::Unsatisfiable);
        assert_eq!(parse_range("bytes=5-1", 1000), Wanted::Whole);
        assert_eq!(parse_range("bytes=0-1,5-6", 1000), Wanted::Whole);
        assert_eq!(parse_range("items=0-1", 1000), Wanted::Whole);
        assert_eq!(parse_range("bytes=a-b", 1000), Wanted::Whole);
    }

    #[test]
    fn names() {
        assert_eq!(
            download_name(&["Umberto Eco".into()], "Il nome/della rosa", "epub"),
            "Umberto Eco - Il nome_della rosa.epub"
        );
        assert_eq!(download_name(&[], "Dune", "pdf"), "Dune.pdf");
        let d = disposition("Jörg - Prüfung.epub");
        assert!(d.contains("filename=\"Jorg - Prufung.epub\""), "{d}");
        assert!(
            d.contains("filename*=UTF-8''J%C3%B6rg%20-%20Pr%C3%BCfung.epub"),
            "{d}"
        );
    }
}
