//! One-time pairing codes to add a device for an existing user.

use axum::{extract::State, http::StatusCode, routing::post, Json};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::api::setup::{AuthOut, LibraryOut, UserOut};
use crate::audit;
use crate::auth::guard::AuthUser;
use crate::auth::limit;
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
    /// Required (1 to 60 characters) when the code is an invite; ignored for a device code.
    #[serde(default)]
    pub display_name: Option<String>,
}

// No `Debug`: the body carries the clear-text code.
#[derive(Deserialize, ToSchema)]
pub struct InspectRequest {
    pub code: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum CodeKind {
    Device,
    Invite,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CodeInfo {
    pub kind: CodeKind,
    pub library_name: String,
    /// Only for invites.
    pub role: Option<Role>,
    /// Only for device codes: the person the device would be added to.
    pub user_display_name: Option<String>,
    pub expires_at: i64,
}

/// What a new pairing code is for.
pub enum NewCode<'a> {
    Device { user_id: &'a str },
    Invite { role: Role },
}

/// Generates a code (the one format of every pairing code), stores its hash with a fresh id
/// and returns `(id, clear_code)`. Also sweeps the library's expired codes.
pub fn store_code(
    conn: &Connection,
    library_id: &str,
    created_by: &str,
    what: NewCode<'_>,
    expires_at: i64,
    now: i64,
) -> rusqlite::Result<(String, String)> {
    let code = tokens::new_pairing_code();
    let hash = tokens::hash_code(&code);
    let id = uuid::Uuid::now_v7().to_string();
    let (kind, user_id, role) = match what {
        NewCode::Device { user_id } => ("device", Some(user_id), None),
        NewCode::Invite { role } => ("invite", None, Some(role.as_str())),
    };
    conn.execute(
        "DELETE FROM pairing_codes WHERE library_id = ?1 AND expires_at <= ?2",
        params![library_id, now],
    )?;
    conn.execute(
        "INSERT INTO pairing_codes
           (code_hash, id, library_id, kind, user_id, role, created_by, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![hash, id, library_id, kind, user_id, role, created_by, expires_at, now],
    )?;
    Ok((id, code))
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
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: guests cannot pair devices", body = ApiErrorBody),
    )
)]
pub async fn create_code(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<(StatusCode, Json<PairingCode>)> {
    user.require(Role::Member)?;
    let now = now_secs();
    let expires_at = now + PAIRING_TTL_SECS;
    let code = state
        .db
        .run(move |conn| {
            let what = NewCode::Device {
                user_id: &user.user_id,
            };
            let (_, code) =
                store_code(conn, &user.library_id, &user.user_id, what, expires_at, now)?;
            Ok(code)
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
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "pairing_code_invalid: code wrong, expired or already used", body = ApiErrorBody),
        (status = 422, description = "validation: invalid fields (an invite needs display_name)", body = ApiErrorBody),
        (status = 429, description = "rate_limited: too many attempts (Retry-After header)", body = ApiErrorBody),
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
    let display_name = req.display_name;
    let secret = state.jwt_secret.clone();
    let attempt = state
        .limiter
        .begin("redeem", limit::REDEEM, now_secs())
        .map_err(ApiError::too_many_requests)?;

    let out = state
        .db
        .run(move |conn| {
            let now = now_secs();
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = redeem_in_tx(
                conn,
                &secret,
                &hash,
                &name,
                kind,
                display_name.as_deref(),
                now,
            );
            match &result {
                Ok(Ok(_)) => conn.execute_batch("COMMIT")?,
                _ => conn.execute_batch("ROLLBACK")?,
            }
            result
        })
        .await?;
    match &out {
        Err(e) if e.code == "pairing_code_invalid" => attempt.failed(),
        Ok(_) => attempt.succeeded(),
        Err(_) => attempt.neutral(),
    }
    Ok(Json(out?))
}

/// Dispatches on the kind of the (still valid) code. Nothing is consumed on a validation error.
fn redeem_in_tx(
    conn: &mut Connection,
    secret: &[u8],
    hash: &str,
    name: &str,
    kind: DeviceKind,
    display_name: Option<&str>,
    now: i64,
) -> rusqlite::Result<Result<AuthOut, ApiError>> {
    let code_kind: Option<String> = conn
        .query_row(
            "SELECT kind FROM pairing_codes
             WHERE code_hash = ?1 AND used_at IS NULL AND expires_at > ?2",
            params![hash, now],
            |r| r.get(0),
        )
        .optional()?;
    match code_kind.as_deref() {
        Some("invite") => redeem_invite_in_tx(conn, secret, hash, name, kind, display_name, now),
        _ => redeem_device_in_tx(conn, secret, hash, name, kind, now),
    }
}

fn redeem_invite_in_tx(
    conn: &mut Connection,
    secret: &[u8],
    hash: &str,
    name: &str,
    kind: DeviceKind,
    display_name: Option<&str>,
    now: i64,
) -> rusqlite::Result<Result<AuthOut, ApiError>> {
    let display_name = display_name.map(str::trim).unwrap_or_default();
    if display_name.is_empty() || display_name.chars().count() > 60 {
        return Ok(Err(ApiError::validation(
            "display_name must be 1 to 60 characters",
        )));
    }
    let used = conn.execute(
        "UPDATE pairing_codes SET used_at = ?1
         WHERE code_hash = ?2 AND used_at IS NULL AND expires_at > ?1 AND kind = 'invite'",
        params![now, hash],
    )?;
    if used == 0 {
        return Ok(Err(invalid_code()));
    }
    let (library_id, library_name, role): (String, String, String) = conn.query_row(
        "SELECT l.id, l.name, p.role FROM pairing_codes p
         JOIN libraries l ON l.id = p.library_id WHERE p.code_hash = ?1",
        params![hash],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let Ok(role) = role.parse::<Role>() else {
        return Ok(Err(ApiError::internal()));
    };
    let user_id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO users (id, library_id, display_name, role, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, library_id, display_name, role.as_str(), now],
    )?;
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
    let who = AuthUser {
        library_id: library_id.clone(),
        user_id: user_id.clone(),
        device_id: session.device_id.clone(),
        role,
    };
    audit::record(
        conn,
        &who,
        "user.join",
        "user",
        &user_id,
        Some(&serde_json::json!({ "display_name": display_name, "role": role.as_str() })),
        now,
    )?;
    Ok(Ok(AuthOut {
        library: LibraryOut {
            id: library_id,
            name: library_name,
        },
        user: UserOut {
            id: user_id,
            display_name: display_name.to_string(),
            email: None,
            role,
        },
        session,
    }))
}

fn redeem_device_in_tx(
    conn: &mut Connection,
    secret: &[u8],
    hash: &str,
    name: &str,
    kind: DeviceKind,
    now: i64,
) -> rusqlite::Result<Result<AuthOut, ApiError>> {
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

#[utoipa::path(
    post,
    path = "/api/v1/pairing/inspect",
    tag = "pairing",
    request_body = InspectRequest,
    responses(
        (status = 200, description = "What the code is for; the code is not consumed", body = CodeInfo),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "pairing_code_invalid: code wrong, expired or already used", body = ApiErrorBody),
        (status = 422, description = "validation: invalid fields", body = ApiErrorBody),
        (status = 429, description = "rate_limited: too many attempts (Retry-After header)", body = ApiErrorBody),
    )
)]
pub async fn inspect(
    State(state): State<AppState>,
    ApiJson(req): ApiJson<InspectRequest>,
) -> ApiResult<Json<CodeInfo>> {
    let hash = tokens::hash_code(&req.code);
    let attempt = state
        .limiter
        .begin("redeem", limit::REDEEM, now_secs())
        .map_err(ApiError::too_many_requests)?;
    let info = state
        .db
        .run(move |conn| {
            conn.query_row(
                "SELECT p.kind, l.name, p.role, u.display_name, p.expires_at
                 FROM pairing_codes p
                 JOIN libraries l ON l.id = p.library_id
                 LEFT JOIN users u ON u.id = p.user_id
                 WHERE p.code_hash = ?1 AND p.used_at IS NULL AND p.expires_at > ?2",
                params![hash, now_secs()],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
        })
        .await?;
    let Some((kind, library_name, role, user_name, expires_at)) = info else {
        attempt.failed();
        return Err(invalid_code());
    };
    // A successful look-up must not clear the failures of the shared limit.
    attempt.neutral();
    let invite = kind == "invite";
    Ok(Json(CodeInfo {
        kind: if invite {
            CodeKind::Invite
        } else {
            CodeKind::Device
        },
        library_name,
        role: if invite {
            role.and_then(|r| r.parse().ok())
        } else {
            None
        },
        user_display_name: if invite { None } else { user_name },
        expires_at,
    }))
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/pairing/codes", post(create_code))
        .route("/api/v1/pairing/redeem", post(redeem))
        .route("/api/v1/pairing/inspect", post(inspect))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(create_code, redeem, inspect),
    components(schemas(PairingCode, RedeemRequest, InspectRequest, CodeInfo, CodeKind))
)]
pub struct Doc;
