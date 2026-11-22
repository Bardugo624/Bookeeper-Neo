//! One-time pairing codes to add a device for an existing user.

use axum::{extract::State, http::StatusCode, routing::post, Json};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::api::setup::{AuthOut, LibraryOut, UserOut};
use crate::auth::guard::AuthUser;
use crate::auth::sessions::{create_device, NewDevice};
use crate::auth::{tokens, DeviceKind, Role, Session, PAIRING_TTL_SECS};
use crate::error::{ApiError, ApiErrorBody, ApiResult};
use crate::extract::ApiJson;
use crate::state::AppState;

#[derive(Debug, Serialize, ToSchema)]
pub struct PairingCode {
    /// Clear-text code; shown only in this response.
    pub code: String,
    pub expires_at: i64,
}

// No `Debug`: the body carries the clear-text code.
#[derive(Deserialize, ToSchema)]
pub struct RedeemRequest {
    pub code: String,
    pub device_name: String,
    pub device_kind: DeviceKind,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn invalid_code() -> ApiError {
    ApiError::coded(
        StatusCode::UNAUTHORIZED,
        "pairing_code_invalid",
        "Pairing code is not valid",
    )
}

#[utoipa::path(
    post,
    path = "/api/v1/pairing/codes",
    tag = "pairing",
    security(("bearer" = [])),
    responses(
        (status = 201, description = "Code created", body = PairingCode),
        (status = 401, description = "Not authenticated", body = ApiErrorBody),
        (status = 403, description = "Guests cannot pair devices", body = ApiErrorBody),
    )
)]
pub async fn create_code(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<(StatusCode, Json<PairingCode>)> {
    user.require(Role::Member)?;
    let code = tokens::new_pairing_code();
    let hash = tokens::hash_code(&code);
    let now = now_secs();
    let expires_at = now + PAIRING_TTL_SECS;
    state
        .db
        .run(move |conn| {
            conn.execute(
                "DELETE FROM pairing_codes WHERE library_id = ?1 AND expires_at <= ?2",
                params![user.library_id, now],
            )?;
            conn.execute(
                "INSERT INTO pairing_codes
                   (code_hash, library_id, kind, user_id, role, created_by, expires_at, created_at)
                 VALUES (?1, ?2, 'device', ?3, NULL, ?3, ?4, ?5)",
                params![hash, user.library_id, user.user_id, expires_at, now],
            )?;
            Ok(())
        })
        .await?;
    Ok((StatusCode::CREATED, Json(PairingCode { code, expires_at })))
}

#[utoipa::path(
    post,
    path = "/api/v1/pairing/redeem",
    tag = "pairing",
    request_body = RedeemRequest,
    responses(
        (status = 200, description = "Device paired", body = AuthOut),
        (status = 401, description = "Code wrong, expired or already used", body = ApiErrorBody),
        (status = 422, description = "Invalid fields", body = ApiErrorBody),
    )
)]
pub async fn redeem(
    State(state): State<AppState>,
    ApiJson(req): ApiJson<RedeemRequest>,
) -> ApiResult<Json<AuthOut>> {
    let name = req.device_name.trim().to_string();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::validation(
            "device_name must be 1 to 80 characters",
        ));
    }
    let hash = tokens::hash_code(&req.code);
    let kind = req.device_kind;
    let secret = state.jwt_secret.clone();

    let out = state
        .db
        .run(move |conn| {
            let now = now_secs();
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = redeem_in_tx(conn, &secret, &hash, &name, kind, now);
            match &result {
                Ok(Ok(_)) => conn.execute_batch("COMMIT")?,
                _ => conn.execute_batch("ROLLBACK")?,
            }
            result
        })
        .await??;
    Ok(Json(out))
}

fn redeem_in_tx(
    conn: &mut Connection,
    secret: &[u8],
    hash: &str,
    name: &str,
    kind: DeviceKind,
    now: i64,
) -> rusqlite::Result<Result<AuthOut, ApiError>> {
    {
        {
            let used = conn.execute(
                "UPDATE pairing_codes SET used_at = ?1
                 WHERE code_hash = ?2 AND used_at IS NULL AND expires_at > ?1 AND kind = 'device'",
                params![now, hash],
            )?;
            if used == 0 {
                return Ok(Err(invalid_code()));
            }
            let row = conn
                .query_row(
                    "SELECT l.id, l.name, u.id, u.display_name, u.email, u.role
                     FROM pairing_codes p
                     JOIN users u ON u.id = p.user_id
                     JOIN libraries l ON l.id = p.library_id
                     WHERE p.code_hash = ?1",
                    params![hash],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                            r.get::<_, Option<String>>(4)?,
                            r.get::<_, String>(5)?,
                        ))
                    },
                )
                .optional()?;
            let Some((library_id, library_name, user_id, display_name, email, role)) = row else {
                return Ok(Err(invalid_code()));
            };
            let Ok(role) = role.parse::<Role>() else {
                return Ok(Err(ApiError::internal()));
            };
            let session: Session = create_device(
                conn,
                secret,
                NewDevice {
                    library_id: &library_id,
                    user_id: &user_id,
                    role,
                    name,
                    kind,
                },
                now,
            )?;
            Ok(Ok(AuthOut {
                library: LibraryOut {
                    id: library_id,
                    name: library_name,
                },
                user: UserOut {
                    id: user_id,
                    display_name,
                    email,
                    role,
                },
                session,
            }))
        }
    }
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/pairing/codes", post(create_code))
        .route("/api/v1/pairing/redeem", post(redeem))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(create_code, redeem),
    components(schemas(PairingCode, RedeemRequest))
)]
pub struct Doc;
