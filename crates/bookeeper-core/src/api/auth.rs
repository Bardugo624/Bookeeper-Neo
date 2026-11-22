//! Sign-in, session renewal, sign-out, password change and the current profile.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::api::devices::DeviceOut;
use crate::api::setup::{AuthOut, LibraryOut, UserOut};
use crate::auth::guard::AuthUser;
use crate::auth::limit::{self, RateLimiter};
use crate::auth::sessions::{self, create_device, NewDevice, RefreshError};
use crate::auth::{password, DeviceKind, Role, Session};
use crate::error::{ApiError, ApiErrorBody, ApiResult};
use crate::extract::ApiJson;
use crate::state::AppState;

// No `Debug` on request bodies: they carry passwords and refresh tokens.
#[derive(Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    pub library_id: Option<String>,
    pub device_name: String,
    pub device_kind: DeviceKind,
}

#[derive(Deserialize, ToSchema)]
pub struct LibrariesRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct LibrariesOut {
    pub libraries: Vec<LibraryOut>,
}

#[derive(Deserialize, ToSchema)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Serialize, ToSchema)]
pub struct RefreshOut {
    pub session: Session,
}

#[derive(Deserialize, ToSchema)]
pub struct PasswordRequest {
    pub current_password: Option<String>,
    pub new_password: String,
}

#[derive(Serialize, ToSchema)]
pub struct MeOut {
    pub library: LibraryOut,
    pub user: UserOut,
    pub device: DeviceOut,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn invalid_credentials() -> ApiError {
    ApiError::coded(
        StatusCode::UNAUTHORIZED,
        "invalid_credentials",
        "Email or password is not correct",
    )
}

fn normalize_email(email: &str) -> ApiResult<String> {
    let e = email.trim().to_lowercase();
    if !e.contains('@') || e.chars().count() > 254 {
        return Err(ApiError::validation("email is not valid"));
    }
    Ok(e)
}

fn login_key(email: &str) -> String {
    format!("login:{email}")
}

fn check_limit(limiter: &RateLimiter, key: &str) -> ApiResult<()> {
    limiter
        .check(key, limit::LOGIN, now_secs())
        .map_err(ApiError::too_many_requests)
}

fn device_name(name: &str) -> ApiResult<String> {
    let n = name.trim();
    if n.is_empty() || n.chars().count() > 80 {
        return Err(ApiError::validation(
            "device_name must be 1 to 80 characters",
        ));
    }
    Ok(n.to_string())
}

struct Match {
    library: LibraryOut,
    user: UserOut,
}

/// Users with this email whose password matches. An Argon2 verification runs for every
/// candidate, and a dummy one when there is none, so timing does not reveal which emails exist.
fn find_matches(
    conn: &Connection,
    email: &str,
    library_id: Option<&str>,
    pw: &str,
) -> rusqlite::Result<Vec<Match>> {
    let mut stmt = conn.prepare(
        "SELECT u.id, u.display_name, u.email, u.role, u.password_hash, l.id, l.name
         FROM users u JOIN libraries l ON l.id = u.library_id
         WHERE u.email = ?1 AND (?2 IS NULL OR u.library_id = ?2)
         ORDER BY l.created_at, l.id",
    )?;
    let rows = stmt
        .query_map(params![email, library_id], |r| {
            Ok((
                UserOut {
                    id: r.get(0)?,
                    display_name: r.get(1)?,
                    email: r.get(2)?,
                    role: r
                        .get::<_, String>(3)?
                        .parse::<Role>()
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                },
                r.get::<_, Option<String>>(4)?,
                LibraryOut {
                    id: r.get(5)?,
                    name: r.get(6)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if rows.is_empty() {
        password::verify_dummy(pw);
    }
    let mut out = Vec::new();
    for (user, hash, library) in rows {
        let ok = match hash {
            Some(h) => password::verify(pw, &h),
            None => {
                password::verify_dummy(pw);
                false
            }
        };
        if ok {
            out.push(Match { library, user });
        }
    }
    Ok(out)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Signed in on a new device", body = AuthOut),
        (status = 401, description = "Wrong email or password", body = ApiErrorBody),
        (status = 409, description = "The credentials match several libraries", body = ApiErrorBody),
        (status = 422, description = "Invalid fields", body = ApiErrorBody),
    )
)]
pub async fn login(
    State(s): State<AppState>,
    ApiJson(req): ApiJson<LoginRequest>,
) -> ApiResult<Json<AuthOut>> {
    let email = normalize_email(&req.email)?;
    let name = device_name(&req.device_name)?;
    let kind = req.device_kind;
    let (pw, library_id) = (req.password, req.library_id);
    let secret = s.jwt_secret.clone();
    let key = login_key(&email);
    check_limit(&s.limiter, &key)?;

    let out =
        s.db.run(move |conn| {
            let mut found = find_matches(conn, &email, library_id.as_deref(), &pw)?;
            if found.is_empty() {
                return Ok(Err(invalid_credentials()));
            }
            if found.len() > 1 {
                return Ok(Err(ApiError::conflict(
                    "library_choice_required",
                    "These credentials belong to several libraries; choose one",
                )));
            }
            let Match { library, user } = found.remove(0);
            let session = create_device(
                conn,
                &secret,
                NewDevice {
                    library_id: &library.id,
                    user_id: &user.id,
                    role: user.role,
                    name: &name,
                    kind,
                },
                now_secs(),
            )?;
            Ok(Ok(AuthOut {
                library,
                user,
                session,
            }))
        })
        .await?;
    match &out {
        Err(e) if e.code == "invalid_credentials" => {
            s.limiter.record_failure(&key, limit::LOGIN, now_secs())
        }
        Ok(_) => s.limiter.reset(&key),
        Err(_) => {}
    }
    Ok(Json(out?))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/libraries",
    tag = "auth",
    request_body = LibrariesRequest,
    responses(
        (status = 200, description = "Libraries matching the credentials", body = LibrariesOut),
        (status = 401, description = "Wrong email or password", body = ApiErrorBody),
        (status = 422, description = "Invalid fields", body = ApiErrorBody),
    )
)]
pub async fn libraries(
    State(s): State<AppState>,
    ApiJson(req): ApiJson<LibrariesRequest>,
) -> ApiResult<Json<LibrariesOut>> {
    let email = normalize_email(&req.email)?;
    let pw = req.password;
    let key = login_key(&email);
    check_limit(&s.limiter, &key)?;
    let found =
        s.db.run(move |conn| find_matches(conn, &email, None, &pw))
            .await?;
    if found.is_empty() {
        s.limiter.record_failure(&key, limit::LOGIN, now_secs());
        return Err(invalid_credentials());
    }
    s.limiter.reset(&key);
    Ok(Json(LibrariesOut {
        libraries: found.into_iter().map(|m| m.library).collect(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/refresh",
    tag = "auth",
    request_body = RefreshRequest,
    responses(
        (status = 200, description = "New session", body = RefreshOut),
        (status = 401, description = "refresh_invalid, refresh_reused or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn refresh(
    State(s): State<AppState>,
    ApiJson(req): ApiJson<RefreshRequest>,
) -> ApiResult<Json<RefreshOut>> {
    let secret = s.jwt_secret.clone();
    let token = req.refresh_token;
    let result =
        s.db.run(move |conn| sessions::refresh(conn, &secret, &token, now_secs()))
            .await?;
    match result {
        Ok(session) => Ok(Json(RefreshOut { session })),
        Err(RefreshError::Invalid) => Err(ApiError::coded(
            StatusCode::UNAUTHORIZED,
            "refresh_invalid",
            "Refresh token is not valid",
        )),
        Err(RefreshError::Reused) => Err(ApiError::coded(
            StatusCode::UNAUTHORIZED,
            "refresh_reused",
            "Refresh token was already used; the device has been revoked",
        )),
        Err(RefreshError::Revoked) => Err(ApiError::coded(
            StatusCode::UNAUTHORIZED,
            "device_revoked",
            "Device has been revoked",
        )),
    }
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "auth",
    security(("bearer" = [])),
    responses(
        (status = 204, description = "This device has been revoked"),
        (status = 401, description = "Not signed in", body = ApiErrorBody),
    )
)]
pub async fn logout(State(s): State<AppState>, user: AuthUser) -> ApiResult<StatusCode> {
    s.db.run(move |conn| {
        sessions::revoke_device(conn, &user.library_id, &user.device_id, now_secs())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/password",
    tag = "auth",
    security(("bearer" = [])),
    request_body = PasswordRequest,
    responses(
        (status = 204, description = "Password changed; other devices revoked"),
        (status = 401, description = "Current password is wrong", body = ApiErrorBody),
        (status = 409, description = "Current password is required", body = ApiErrorBody),
        (status = 422, description = "Invalid fields", body = ApiErrorBody),
    )
)]
pub async fn change_password(
    State(s): State<AppState>,
    user: AuthUser,
    ApiJson(req): ApiJson<PasswordRequest>,
) -> ApiResult<StatusCode> {
    let n = req.new_password.chars().count();
    if !(8..=256).contains(&n) {
        return Err(ApiError::validation(
            "new_password must be 8 to 256 characters",
        ));
    }
    let (current, new_pw) = (req.current_password, req.new_password);

    s.db.run(move |conn| -> rusqlite::Result<ApiResult<()>> {
        let row: Option<(Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT password_hash, email FROM users WHERE id = ?1 AND library_id = ?2",
                params![user.user_id, user.library_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((hash, email)) = row else {
            return Ok(Err(ApiError::unauthorized()));
        };
        match hash {
            Some(h) => {
                let Some(cur) = current else {
                    return Ok(Err(ApiError::conflict(
                        "password_required",
                        "The current password is required",
                    )));
                };
                if !password::verify(&cur, &h) {
                    return Ok(Err(invalid_credentials()));
                }
            }
            None => {
                if email.is_none() {
                    return Ok(Err(ApiError::validation(
                        "an email is required before setting a password",
                    )));
                }
            }
        }
        let Ok(new_hash) = password::hash(&new_pw) else {
            return Ok(Err(ApiError::internal()));
        };
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            params![new_hash, user.user_id],
        )?;
        tx.execute(
            "UPDATE devices SET revoked_at = ?1
                 WHERE user_id = ?2 AND id <> ?3 AND revoked_at IS NULL",
            params![now_secs(), user.user_id, user.device_id],
        )?;
        tx.commit()?;
        Ok(Ok(()))
    })
    .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/me",
    tag = "auth",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Library, user and current device", body = MeOut),
        (status = 401, description = "Not signed in", body = ApiErrorBody),
    )
)]
pub async fn me(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<MeOut>> {
    let out =
        s.db.run(move |conn| -> rusqlite::Result<Option<MeOut>> {
            conn.query_row(
                "SELECT l.id, l.name, u.id, u.display_name, u.email, u.role,
                        d.id, d.name, d.kind, d.paired_at, d.last_seen, d.revoked_at
                 FROM devices d
                 JOIN users u ON u.id = d.user_id
                 JOIN libraries l ON l.id = u.library_id
                 WHERE d.id = ?1 AND l.id = ?2",
                params![user.device_id, user.library_id],
                |r| {
                    let role: String = r.get(5)?;
                    let kind: String = r.get(8)?;
                    let display_name: String = r.get(3)?;
                    let user_id: String = r.get(2)?;
                    Ok(MeOut {
                        library: LibraryOut {
                            id: r.get(0)?,
                            name: r.get(1)?,
                        },
                        user: UserOut {
                            id: user_id.clone(),
                            display_name: display_name.clone(),
                            email: r.get(4)?,
                            role: role.parse().map_err(|_| rusqlite::Error::InvalidQuery)?,
                        },
                        device: DeviceOut {
                            id: r.get(6)?,
                            name: r.get(7)?,
                            kind: if kind == "mobile" {
                                DeviceKind::Mobile
                            } else {
                                DeviceKind::Desktop
                            },
                            user_id,
                            user_name: display_name,
                            paired_at: r.get(9)?,
                            last_seen: r.get(10)?,
                            revoked_at: r.get(11)?,
                            current: true,
                        },
                    })
                },
            )
            .optional()
        })
        .await?;
    out.map(Json).ok_or_else(ApiError::unauthorized)
}

pub fn routes() -> axum::Router<crate::AppState> {
    axum::Router::new()
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/libraries", post(libraries))
        .route("/api/v1/auth/refresh", post(refresh))
        .route("/api/v1/auth/logout", post(logout))
        .route("/api/v1/auth/password", post(change_password))
        .route("/api/v1/me", get(me))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(login, libraries, refresh, logout, change_password, me),
    components(schemas(
        LoginRequest,
        LibrariesRequest,
        LibrariesOut,
        RefreshRequest,
        RefreshOut,
        PasswordRequest,
        MeOut,
        AuthOut,
        LibraryOut,
        UserOut,
        DeviceOut,
        Session
    ))
)]
pub struct Doc;
