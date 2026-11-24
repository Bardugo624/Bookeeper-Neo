//! Library backup and restore.
use axum::{
    body::Body,
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::Response,
    routing::post,
    Json,
};
use utoipa::ToSchema;

use crate::{
    api::{
        confirm::Confirmed,
        util::{download, now_secs, read_body},
    },
    audit,
    auth::{guard::AuthUser, Role},
    backup::{self, BackupError, RestoreReport},
    error::{ApiError, ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/backup", post(create_backup))
        .route("/api/v1/restore", post(restore))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(create_backup, restore),
    components(schemas(RestoreReport, ArchiveBody))
)]
pub struct Doc;

/// Documentation-only schema of the restore request body.
#[derive(ToSchema)]
#[schema(value_type = String, format = Binary)]
pub struct ArchiveBody(#[allow(dead_code)] Vec<u8>);

impl From<BackupError> for ApiError {
    fn from(e: BackupError) -> ApiError {
        match e {
            BackupError::Invalid(msg) => ApiError::coded(
                StatusCode::BAD_REQUEST,
                "invalid_archive",
                format!("The backup archive is not valid: {msg}"),
            ),
            other => {
                tracing::error!(error = %other, "backup failure");
                ApiError::internal()
            }
        }
    }
}

/// Owner role first (403), then the confirmation token (401).
pub struct OwnerConfirmed(pub AuthUser);

impl FromRequestParts<AppState> for OwnerConfirmed {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        user.require(Role::Owner)?;
        let Confirmed(user) = Confirmed::from_request_parts(parts, state).await?;
        Ok(OwnerConfirmed(user))
    }
}

/// Download a zip archive with the whole library, covers included.
#[utoipa::path(
    post,
    path = "/api/v1/backup",
    tag = "backup",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "The archive", content_type = "application/zip", body = Vec<u8>),
        (status = 403, description = "Admin or owner only", body = ApiErrorBody),
    )
)]
pub async fn create_backup(State(state): State<AppState>, who: AuthUser) -> ApiResult<Response> {
    who.require(Role::Admin)?;
    let files = state.files.clone();
    let now = now_secs();
    let (bytes, name) = state
        .db
        .run(move |conn| {
            let bytes = match backup::create_archive(conn, &files, &who.library_id, now) {
                Ok(b) => b,
                Err(e) => return Ok(Err(e)),
            };
            let name = backup::archive_filename(conn, &who.library_id, now)?;
            let detail = serde_json::json!({ "size_bytes": bytes.len() });
            audit::record(
                conn,
                &who,
                "library.backup",
                "library",
                &who.library_id,
                Some(&detail),
                now,
            )?;
            Ok(Ok((bytes, name)))
        })
        .await??;
    Ok(download(bytes, "application/zip", &name))
}

/// Replace the library with the content of an archive (owner, needs a confirm token).
#[utoipa::path(
    post,
    path = "/api/v1/restore",
    tag = "backup",
    security(("bearer" = [])),
    params(("X-Confirm-Token" = String, Header, description = "Token from POST /auth/confirm")),
    request_body(content = ArchiveBody, content_type = "application/zip"),
    responses(
        (status = 200, description = "Restored", body = RestoreReport),
        (status = 400, description = "invalid_archive", body = ApiErrorBody),
        (status = 401, description = "confirmation_required", body = ApiErrorBody),
        (status = 403, description = "Owner only", body = ApiErrorBody),
        (status = 413, description = "payload_too_large", body = ApiErrorBody),
    )
)]
pub async fn restore(
    State(state): State<AppState>,
    OwnerConfirmed(who): OwnerConfirmed,
    body: Body,
) -> ApiResult<Json<RestoreReport>> {
    let bytes = read_body(body, backup::MAX_ARCHIVE_BYTES).await?;
    let files = state.files.clone();
    let now = now_secs();
    let report = state
        .db
        .run(move |conn| Ok(backup::restore_archive(conn, &files, &who, &bytes, now)))
        .await??;
    Ok(Json(report))
}
