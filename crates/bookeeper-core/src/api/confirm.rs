//! Password confirmation for destructive operations: a short-lived confirm token.

use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    routing::post,
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::guard::AuthUser;
use crate::auth::limit;
use crate::auth::tokens::{issue_confirm, verify_confirm, CONFIRM_TTL_SECS};
use crate::auth::{password, Identity};
use crate::error::{ApiError, ApiErrorBody, ApiResult};
use crate::extract::ApiJson;
use crate::state::AppState;

pub const CONFIRM_HEADER: &str = "x-confirm-token";

// No `Debug`: carries a password.
#[derive(Deserialize, ToSchema)]
pub struct ConfirmRequest {
    pub password: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ConfirmOut {
    pub confirm_token: String,
    pub expires_in: i64,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn confirmation_required() -> ApiError {
    ApiError::coded(
        StatusCode::UNAUTHORIZED,
        "confirmation_required",
        "A valid confirmation token is required",
    )
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/confirm",
    tag = "auth",
    security(("bearer" = [])),
    request_body = ConfirmRequest,
    responses(
        (status = 200, description = "Confirmation token", body = ConfirmOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "invalid_credentials: wrong password; or unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 422, description = "validation: password required", body = ApiErrorBody),
        (status = 429, description = "rate_limited: too many wrong attempts (Retry-After header)", body = ApiErrorBody),
    )
)]
pub async fn confirm(
    State(s): State<AppState>,
    user: AuthUser,
    ApiJson(req): ApiJson<ConfirmRequest>,
) -> ApiResult<Json<ConfirmOut>> {
    let key = format!("confirm:{}", user.user_id);
    let attempt = s
        .limiter
        .begin(&key, limit::LOGIN, now_secs())
        .map_err(ApiError::too_many_requests)?;
    let (uid, lid, given) = (user.user_id.clone(), user.library_id.clone(), req.password);
    // Ok(true): confirmed; Ok(false): wrong password.
    let out =
        s.db.run(move |conn| -> rusqlite::Result<ApiResult<bool>> {
            let hash: Option<Option<String>> = conn
                .query_row(
                    "SELECT password_hash FROM users WHERE id = ?1 AND library_id = ?2",
                    params![uid, lid],
                    |r| r.get(0),
                )
                .optional()?;
            Ok(match hash {
                None => Err(ApiError::unauthorized()),
                Some(None) => Ok(true),
                Some(Some(h)) => match given {
                    None => Err(ApiError::validation("password is required")),
                    Some(p) => Ok(password::verify(&p, &h)),
                },
            })
        })
        .await?;
    match out {
        Ok(true) => attempt.succeeded(),
        Ok(false) => {
            attempt.failed();
            return Err(ApiError::coded(
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
                "Password is not correct",
            ));
        }
        Err(e) => {
            attempt.neutral();
            return Err(e);
        }
    }
    let who = Identity {
        library_id: user.library_id,
        user_id: user.user_id,
        device_id: user.device_id,
        role: user.role,
    };
    Ok(Json(ConfirmOut {
        confirm_token: issue_confirm(&s.jwt_secret, &who, now_secs()),
        expires_in: CONFIRM_TTL_SECS,
    }))
}

/// Besides the access token, requires a valid confirm token in `X-Confirm-Token`,
/// issued for the same user and device. Otherwise 401 `confirmation_required`.
pub struct Confirmed(pub AuthUser);

impl FromRequestParts<AppState> for Confirmed {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        let token = parts
            .headers
            .get(CONFIRM_HEADER)
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(confirmation_required)?;
        let claims = verify_confirm(&state.jwt_secret, token, now_secs())
            .map_err(|_| confirmation_required())?;
        if claims.lid != user.library_id
            || claims.uid != user.user_id
            || claims.did != user.device_id
        {
            return Err(confirmation_required());
        }
        Ok(Confirmed(user))
    }
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/auth/confirm", post(confirm))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(confirm), components(schemas(ConfirmRequest, ConfirmOut)))]
pub struct Doc;
