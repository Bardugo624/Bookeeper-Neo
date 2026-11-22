//! First-run setup: create a library, its owner and the first device.

use axum::{extract::State, http::StatusCode, routing::get, Json};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::sessions::{create_device, NewDevice};
use crate::auth::{password, tokens, DeviceKind, Role, Session};
use crate::error::{ApiError, ApiResult};
use crate::extract::ApiJson;
use crate::state::{AppState, SetupPolicy};

const SETUP_CODE_KEY: &str = "setup_code_hash";

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LibraryOut {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserOut {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AuthOut {
    pub library: LibraryOut,
    pub user: UserOut,
    pub session: Session,
}

#[derive(Serialize, ToSchema)]
pub struct SetupStatus {
    pub needs_setup: bool,
    pub code_required: bool,
}

// No `Debug`: the body carries the password and the setup code.
#[derive(Deserialize, ToSchema)]
pub struct SetupRequest {
    pub library_name: String,
    pub display_name: String,
    pub email: Option<String>,
    pub password: Option<String>,
    pub setup_code: Option<String>,
    pub device_name: String,
    pub device_kind: DeviceKind,
}

/// Generates a new setup code, stores its hash (replacing any previous one) and returns it
/// in clear as `XXXX-XXXX-XXXX`.
pub fn new_setup_code(conn: &mut Connection) -> rusqlite::Result<String> {
    let code = tokens::new_setup_code();
    conn.execute(
        "INSERT OR REPLACE INTO server_meta (key, value) VALUES (?1, ?2)",
        params![SETUP_CODE_KEY, tokens::hash_code(&code)],
    )?;
    Ok(code)
}

pub fn library_count(conn: &mut Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get(0))
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn trimmed(field: &str, value: &str) -> ApiResult<String> {
    let v = value.trim();
    if v.is_empty() || v.chars().count() > 80 {
        return Err(ApiError::validation(format!(
            "{field} must be 1 to 80 characters"
        )));
    }
    Ok(v.to_string())
}

struct Valid {
    library_name: String,
    display_name: String,
    device_name: String,
    email: Option<String>,
    password: Option<String>,
}

fn validate(req: &SetupRequest, policy: SetupPolicy) -> ApiResult<Valid> {
    let library_name = trimmed("library_name", &req.library_name)?;
    let display_name = trimmed("display_name", &req.display_name)?;
    let device_name = trimmed("device_name", &req.device_name)?;
    let email = match req.email.as_deref() {
        Some(e) => {
            let e = e.trim().to_lowercase();
            if !e.contains('@') || e.chars().count() > 254 {
                return Err(ApiError::validation("email is not valid"));
            }
            Some(e)
        }
        None => None,
    };
    let password = match req.password.as_deref() {
        Some(p) => {
            let n = p.chars().count();
            if !(8..=256).contains(&n) {
                return Err(ApiError::validation("password must be 8 to 256 characters"));
            }
            Some(p.to_string())
        }
        None => None,
    };
    if policy == SetupPolicy::CodeRequired && (email.is_none() || password.is_none()) {
        return Err(ApiError::validation("email and password are required"));
    }
    Ok(Valid {
        library_name,
        display_name,
        device_name,
        email,
        password,
    })
}

#[utoipa::path(
    get,
    path = "/api/v1/setup",
    tag = "setup",
    responses((status = 200, description = "Setup status", body = SetupStatus))
)]
pub async fn get_setup(State(s): State<AppState>) -> ApiResult<Json<SetupStatus>> {
    let count = s.db.run(library_count).await?;
    Ok(Json(SetupStatus {
        needs_setup: count == 0,
        code_required: s.setup_policy == SetupPolicy::CodeRequired,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/setup",
    tag = "setup",
    request_body = SetupRequest,
    responses(
        (status = 201, description = "Library created", body = AuthOut),
        (status = 403, description = "Setup code missing or wrong", body = crate::error::ApiErrorBody),
        (status = 409, description = "Setup already done", body = crate::error::ApiErrorBody),
        (status = 422, description = "Invalid fields", body = crate::error::ApiErrorBody),
    )
)]
pub async fn post_setup(
    State(s): State<AppState>,
    ApiJson(req): ApiJson<SetupRequest>,
) -> ApiResult<(StatusCode, Json<AuthOut>)> {
    let policy = s.setup_policy;
    let valid = validate(&req, policy)?;
    let code = req.setup_code;
    let kind = req.device_kind;
    let secret = s.jwt_secret.clone();

    let out = s
        .db
        .run(move |conn| {
            let now = now_secs();
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = (|| -> rusqlite::Result<Result<AuthOut, ApiError>> {
            match policy {
                SetupPolicy::Open => {
                    if library_count(conn)? > 0 {
                        return Ok(Err(ApiError::conflict(
                            "setup_closed",
                            "Setup has already been done",
                        )));
                    }
                }
                SetupPolicy::CodeRequired => {
                    let hash = tokens::hash_code(code.as_deref().unwrap_or(""));
                    // Deleting the row consumes the code atomically.
                    let used = conn.execute(
                        "DELETE FROM server_meta WHERE key = ?1 AND value = ?2",
                        params![SETUP_CODE_KEY, hash],
                    )?;
                    if code.is_none() || used == 0 {
                        return Ok(Err(ApiError::coded(
                            StatusCode::FORBIDDEN,
                            "setup_code_invalid",
                            "Setup code is not valid",
                        )));
                    }
                }
            }

            let password_hash = match valid.password.as_deref().map(password::hash) {
                Some(Ok(h)) => Some(h),
                Some(Err(_)) => return Ok(Err(ApiError::internal())),
                None => None,
            };
            let library_id = uuid::Uuid::now_v7().to_string();
            let user_id = uuid::Uuid::now_v7().to_string();
            conn.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![library_id, valid.library_name, now],
            )?;
            conn.execute(
                "INSERT INTO users (id, library_id, email, password_hash, display_name, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'owner', ?6)",
                params![user_id, library_id, valid.email, password_hash, valid.display_name, now],
            )?;
            let session = create_device(
                conn,
                &secret,
                NewDevice {
                    library_id: &library_id,
                    user_id: &user_id,
                    role: Role::Owner,
                    name: &valid.device_name,
                    kind,
                },
                now,
            )?;
            Ok(Ok(AuthOut {
                library: LibraryOut {
                    id: library_id,
                    name: valid.library_name,
                },
                user: UserOut {
                    id: user_id,
                    display_name: valid.display_name,
                    email: valid.email,
                    role: Role::Owner,
                },
                session,
            }))
            })();
            match &result {
                Ok(Ok(_)) => conn.execute_batch("COMMIT")?,
                _ => conn.execute_batch("ROLLBACK")?,
            }
            result
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

pub fn routes() -> axum::Router<crate::AppState> {
    axum::Router::new().route("/api/v1/setup", get(get_setup).post(post_setup))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(get_setup, post_setup),
    components(schemas(SetupStatus, SetupRequest, AuthOut, LibraryOut, UserOut, Session))
)]
pub struct Doc;
