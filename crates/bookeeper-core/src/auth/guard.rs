//! `AuthUser`: the extractor every protected route takes.

use axum::extract::FromRequestParts;
use axum::http::{header::AUTHORIZATION, request::Parts, StatusCode};

use super::tokens::{verify_access, TokenError};
use super::Role;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// `last_seen` is rewritten only when the stored value is older than this.
const LAST_SEEN_GRANULARITY_SECS: i64 = 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub library_id: String,
    pub user_id: String,
    pub device_id: String,
    pub role: Role,
}

impl AuthUser {
    /// 403 `forbidden` when the role is lower than `min`.
    pub fn require(&self, min: Role) -> ApiResult<()> {
        if self.role.at_least(min) {
            Ok(())
        } else {
            Err(ApiError::forbidden())
        }
    }
}

fn bearer(parts: &Parts) -> Option<&str> {
    let value = parts.headers.get(AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    let token = token.trim();
    (scheme.eq_ignore_ascii_case("bearer") && !token.is_empty()).then_some(token)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

enum Lookup {
    Missing,
    Revoked,
    Active(String),
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<AuthUser, ApiError> {
        let token = bearer(parts).ok_or_else(ApiError::unauthorized)?;
        let now = now_secs();
        let claims = verify_access(&state.jwt_secret, token, now).map_err(|e| match e {
            TokenError::Expired => ApiError::coded(
                StatusCode::UNAUTHORIZED,
                "token_expired",
                "Access token expired",
            ),
            TokenError::Invalid => ApiError::unauthorized(),
        })?;

        let (lid, uid, did) = (claims.lid.clone(), claims.uid.clone(), claims.did.clone());
        let lookup = state
            .db
            .run(move |conn| {
                let row = conn.query_row(
                    "SELECT d.library_id, d.user_id, d.revoked_at, d.last_seen, \
                            u.library_id, u.role \
                     FROM devices d JOIN users u ON u.id = d.user_id \
                     WHERE d.id = ?1",
                    [&did],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, Option<i64>>(2)?,
                            r.get::<_, Option<i64>>(3)?,
                            r.get::<_, String>(4)?,
                            r.get::<_, String>(5)?,
                        ))
                    },
                );
                let (d_lib, d_user, revoked_at, last_seen, u_lib, role) = match row {
                    Ok(row) => row,
                    Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(Lookup::Missing),
                    Err(e) => return Err(e),
                };
                if d_lib != lid || d_user != uid || u_lib != lid {
                    return Ok(Lookup::Missing);
                }
                if revoked_at.is_some() {
                    return Ok(Lookup::Revoked);
                }
                if last_seen.is_none_or(|t| now - t > LAST_SEEN_GRANULARITY_SECS) {
                    conn.execute(
                        "UPDATE devices SET last_seen = ?1 WHERE id = ?2",
                        rusqlite::params![now, did],
                    )?;
                }
                Ok(Lookup::Active(role))
            })
            .await?;

        match lookup {
            Lookup::Missing => Err(ApiError::unauthorized()),
            Lookup::Revoked => Err(ApiError::coded(
                StatusCode::UNAUTHORIZED,
                "device_revoked",
                "Device has been revoked",
            )),
            Lookup::Active(role) => {
                let role = role.parse::<Role>().map_err(|e| {
                    tracing::error!(error = %e, "invalid role in database");
                    ApiError::internal()
                })?;
                Ok(AuthUser {
                    library_id: claims.lid,
                    user_id: claims.uid,
                    device_id: claims.did,
                    role,
                })
            }
        }
    }
}
