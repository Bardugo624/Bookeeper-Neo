//! E-book files as stored on disk, before they belong to a book: upload and
//! the cover extracted from the file.
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, put},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::ApiQuery,
    auth::{guard::AuthUser, Role},
    covers,
    ebooks::{self, EbookFormat, StoreError},
    error::{ApiError, ApiErrorBody, ApiResult},
    state::AppState,
};

/// Default limit per file, in MB; `BOOKEEPER_EBOOK_MAX_MB` changes it.
const DEFAULT_MAX_MB: u64 = 200;
/// Uploaded files that nobody attached are deleted after this long.
const STAGED_TTL: Duration = Duration::from_secs(24 * 3600);
/// The sweep of unattached files runs at most this often.
const SWEEP_EVERY: Duration = Duration::from_secs(3600);

const ALL_FORMATS: [EbookFormat; 6] = [
    EbookFormat::Epub,
    EbookFormat::Pdf,
    EbookFormat::Mobi,
    EbookFormat::Azw3,
    EbookFormat::Fb2,
    EbookFormat::Cbz,
];

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/ebook-files", put(put_ebook_file))
        .route("/api/v1/ebook-files/{sha256}/cover", get(get_ebook_cover))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(put_ebook_file, get_ebook_cover),
    components(schemas(EbookFileInfo, EbookMetadata))
)]
pub struct Doc;

/// Metadata read from the file itself; every field may be missing.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EbookMetadata {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i64>,
    pub isbn_13: Option<String>,
    pub description: Option<String>,
}

/// A stored file with what was read from it.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EbookFileInfo {
    /// Lowercase hexadecimal SHA-256 of the content.
    pub sha256: String,
    /// `epub`, `pdf`, `mobi`, `azw3`, `fb2` or `cbz`.
    pub format: String,
    pub size_bytes: i64,
    /// The name the file had when uploaded.
    pub name: String,
    pub metadata: EbookMetadata,
    /// True when a cover can be taken from the file.
    pub has_cover: bool,
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    /// Original file name; it decides the format when the content is not enough.
    pub name: String,
}

/// The size limit of one file, in bytes.
pub fn max_bytes() -> u64 {
    std::env::var("BOOKEEPER_EBOOK_MAX_MB")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|mb| *mb > 0)
        .unwrap_or(DEFAULT_MAX_MB)
        .saturating_mul(1 << 20)
}

/// The stored copy of `sha256` with its format; `None` when not on disk or
/// when `sha256` is not a digest.
pub fn find_stored(dir: &std::path::Path, sha256: &str) -> Option<(PathBuf, EbookFormat)> {
    ALL_FORMATS.into_iter().find_map(|f| {
        let p = ebooks::ebook_path(dir, sha256, f)?;
        p.is_file().then_some((p, f))
    })
}

fn store_error(e: StoreError) -> ApiError {
    match e {
        StoreError::TooLarge => ApiError::coded(
            StatusCode::PAYLOAD_TOO_LARGE,
            "payload_too_large",
            "The file is larger than the limit",
        ),
        StoreError::Unsupported => ApiError::coded(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_format",
            "The file is not an EPUB, PDF, MOBI, AZW3, FB2 or CBZ e-book",
        ),
        StoreError::Drm => ApiError::coded(
            StatusCode::UNPROCESSABLE_ENTITY,
            "drm_protected",
            "The file is protected by DRM and cannot be stored",
        ),
        StoreError::Io(e) => {
            tracing::error!(error = %e, "cannot store e-book");
            ApiError::internal()
        }
    }
}

fn too_large() -> ApiError {
    store_error(StoreError::TooLarge)
}

/// Upload an e-book as the raw request body. The body is streamed to disk,
/// never held in memory. A file nobody attaches to a book is deleted after 24 hours.
#[utoipa::path(
    put,
    path = "/api/v1/ebook-files",
    tag = "ebooks",
    security(("bearer" = [])),
    params(("name" = String, Query, description = "Original file name")),
    request_body(content = Vec<u8>, content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Stored (or already stored)", body = EbookFileInfo),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 413, description = "payload_too_large", body = ApiErrorBody),
        (status = 415, description = "unsupported_format", body = ApiErrorBody),
        (status = 422, description = "validation or drm_protected", body = ApiErrorBody),
    )
)]
pub async fn put_ebook_file(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<UploadQuery>,
    headers: HeaderMap,
    body: Body,
) -> ApiResult<Json<EbookFileInfo>> {
    who.require(Role::Member)?;
    let name = q.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 255 {
        return Err(ApiError::validation("name must hold 1 to 255 characters"));
    }
    let max = max_bytes();
    let declared = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    if declared.is_some_and(|n| n > max) {
        return Err(too_large());
    }
    let dir = state.files.ebooks_dir.clone();
    let stored = ebooks::store_stream(&dir, &name, body, max)
        .await
        .map_err(store_error)?;
    let path =
        ebooks::ebook_path(&dir, &stored.sha256, stored.format).ok_or_else(ApiError::internal)?;
    let format = stored.format;
    let (raw, has_cover) = tokio::task::spawn_blocking(move || {
        let raw = ebooks::read_metadata(&path, format);
        let has_cover = ebooks::extract_cover(&path, format)
            .is_some_and(|bytes| covers::process(&bytes).is_ok());
        (raw, has_cover)
    })
    .await
    .map_err(|_| ApiError::internal())?;
    maybe_sweep(&state);
    Ok(Json(EbookFileInfo {
        sha256: stored.sha256,
        format: format.as_str().to_string(),
        size_bytes: i64::try_from(stored.size_bytes).unwrap_or(i64::MAX),
        name,
        metadata: EbookMetadata {
            title: raw.title,
            authors: raw.authors,
            language: raw.language,
            publisher: raw.publisher,
            published_year: raw.published_year.map(i64::from),
            isbn_13: raw.isbn_13,
            description: raw.description,
        },
        has_cover,
    }))
}

/// The cover taken from a stored file, as `image/jpeg`.
#[utoipa::path(
    get,
    path = "/api/v1/ebook-files/{sha256}/cover",
    tag = "ebooks",
    security(("bearer" = [])),
    params(("sha256" = String, Path, description = "SHA-256 of the file")),
    responses(
        (status = 200, description = "JPEG image", content_type = "image/jpeg", body = Vec<u8>),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot use files", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown file, or cover_not_found", body = ApiErrorBody),
    )
)]
pub async fn get_ebook_cover(
    State(state): State<AppState>,
    who: AuthUser,
    Path(sha256): Path<String>,
) -> ApiResult<Response> {
    who.require(Role::Member)?;
    let (path, format) =
        find_stored(&state.files.ebooks_dir, &sha256).ok_or_else(ApiError::not_found)?;
    let jpeg = tokio::task::spawn_blocking(move || {
        let bytes = ebooks::extract_cover(&path, format)?;
        covers::process(&bytes).ok().map(|p| p.jpeg)
    })
    .await
    .map_err(|_| ApiError::internal())?
    .ok_or_else(|| {
        ApiError::coded(
            StatusCode::NOT_FOUND,
            "cover_not_found",
            "The file has no cover",
        )
    })?;
    Ok((
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            // The address is the hash of the content: it never changes.
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=86400"),
            ),
        ],
        jpeg,
    )
        .into_response())
}

// ------------------------------------------------------------------ sweep

fn last_sweeps() -> &'static Mutex<HashMap<PathBuf, Instant>> {
    static LAST: OnceLock<Mutex<HashMap<PathBuf, Instant>>> = OnceLock::new();
    LAST.get_or_init(Mutex::default)
}

/// True (and remembered) when the folder was not swept during the last hour.
fn sweep_due(dir: &std::path::Path) -> bool {
    let mut last = last_sweeps().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    match last.get(dir) {
        Some(t) if now.duration_since(*t) < SWEEP_EVERY => false,
        _ => {
            last.insert(dir.to_path_buf(), now);
            true
        }
    }
}

/// Deletes the stored files no book uses and the orphaned temporaries, when
/// older than `older_than`. Returns how many files went.
pub async fn sweep_unattached(state: &AppState, older_than: Duration) -> ApiResult<usize> {
    let referenced: HashSet<String> = state
        .db
        .run(|conn| {
            let mut stmt = conn.prepare("SELECT DISTINCT sha256 FROM book_files")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<HashSet<_>>>()
        })
        .await?;
    let dir = state.files.ebooks_dir.clone();
    tokio::task::spawn_blocking(move || ebooks::sweep_staged(&dir, &referenced, older_than))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|e| {
            tracing::warn!(error = %e, "cannot sweep the e-book folder");
            ApiError::internal()
        })
}

/// Sweeps in the background, unless it already ran during the last hour.
/// Called at startup (by the router) and after every upload.
pub fn maybe_sweep(state: &AppState) {
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        return;
    };
    if !sweep_due(&state.files.ebooks_dir) {
        return;
    }
    let state = state.clone();
    handle.spawn(async move {
        if let Err(e) = sweep_unattached(&state, STAGED_TTL).await {
            tracing::warn!(status = %e.status, "e-book sweep failed");
        }
    });
}
