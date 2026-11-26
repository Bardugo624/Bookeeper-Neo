//! Invites: one-time codes that add a new person to the library.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::api::pairing::{store_code, NewCode};
use crate::audit;
use crate::auth::{guard::AuthUser, Role};
use crate::error::{ApiError, ApiErrorBody, ApiResult};
use crate::extract::ApiJson;
use crate::state::AppState;

const DEFAULT_DAYS: i64 = 7;
const DAY_SECS: i64 = 86_400;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/invites", get(list_invites).post(create_invite))
        .route("/api/v1/invites/{id}", delete(revoke_invite))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(create_invite, list_invites, revoke_invite),
    components(schemas(NewInvite, InviteRole, InviteCreated, InviteOut, InviteList, Creator))
)]
pub struct Doc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum InviteRole {
    Admin,
    Member,
    Guest,
}

impl InviteRole {
    fn role(self) -> Role {
        match self {
            InviteRole::Admin => Role::Admin,
            InviteRole::Member => Role::Member,
            InviteRole::Guest => Role::Guest,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct NewInvite {
    pub role: InviteRole,
    /// 1 to 30; default 7.
    pub expires_in_days: Option<i64>,
}

// No `Debug`: carries the clear-text code.
#[derive(Serialize, ToSchema)]
pub struct InviteCreated {
    pub id: String,
    /// Clear-text code; shown only in this response.
    pub code: String,
    pub role: Role,
    pub expires_at: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Creator {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InviteOut {
    pub id: String,
    pub role: Role,
    pub created_by: Creator,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InviteList {
    pub items: Vec<InviteOut>,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

#[utoipa::path(
    post,
    path = "/api/v1/invites",
    tag = "invites",
    security(("bearer" = [])),
    request_body = NewInvite,
    responses(
        (status = 201, description = "Invite created; the code is shown only here", body = InviteCreated),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: admins invite members and guests, the owner also admins", body = ApiErrorBody),
        (status = 422, description = "validation: unknown role or expires_in_days outside 1..30", body = ApiErrorBody),
    )
)]
pub async fn create_invite(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<NewInvite>,
) -> ApiResult<(StatusCode, Json<InviteCreated>)> {
    who.require(Role::Admin)?;
    let role = body.role.role();
    if role == Role::Admin && who.role != Role::Owner {
        return Err(ApiError::forbidden());
    }
    let days = body.expires_in_days.unwrap_or(DEFAULT_DAYS);
    if !(1..=30).contains(&days) {
        return Err(ApiError::validation(
            "expires_in_days must be between 1 and 30",
        ));
    }
    let now = now_secs();
    let expires_at = now + days * DAY_SECS;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let (id, code) = store_code(
                &tx,
                &who.library_id,
                &who.user_id,
                NewCode::Invite { role },
                expires_at,
                now,
            )?;
            audit::record(
                &tx,
                &who,
                "invite.create",
                "invite",
                &id,
                Some(&serde_json::json!({ "role": role.as_str(), "expires_at": expires_at })),
                now,
            )?;
            tx.commit()?;
            Ok(InviteCreated {
                id,
                code,
                role,
                expires_at,
            })
        })
        .await?;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    get,
    path = "/api/v1/invites",
    tag = "invites",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Pending invites (not used, not expired), newest first", body = InviteList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: admins and the owner only", body = ApiErrorBody),
    )
)]
pub async fn list_invites(
    State(state): State<AppState>,
    who: AuthUser,
) -> ApiResult<Json<InviteList>> {
    who.require(Role::Admin)?;
    let items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT p.id, p.role, p.created_by, u.display_name, p.created_at, p.expires_at
                 FROM pairing_codes p JOIN users u ON u.id = p.created_by
                 WHERE p.library_id = ?1 AND p.kind = 'invite' AND p.id IS NOT NULL
                   AND p.used_at IS NULL AND p.expires_at > ?2
                 ORDER BY p.created_at DESC, p.id DESC",
            )?;
            let rows = stmt.query_map(params![who.library_id, now_secs()], |r| {
                let role: String = r.get(1)?;
                Ok(InviteOut {
                    id: r.get(0)?,
                    role: role.parse().unwrap_or(Role::Guest),
                    created_by: Creator {
                        id: r.get(2)?,
                        display_name: r.get(3)?,
                    },
                    created_at: r.get(4)?,
                    expires_at: r.get(5)?,
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;
    Ok(Json(InviteList { items }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/invites/{id}",
    tag = "invites",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Invite id")),
    responses(
        (status = 204, description = "Invite revoked"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: admins and the owner only", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown, used or expired invite", body = ApiErrorBody),
    )
)]
pub async fn revoke_invite(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Admin)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let now = now_secs();
            let gone = tx.execute(
                "DELETE FROM pairing_codes
                 WHERE id = ?1 AND library_id = ?2 AND kind = 'invite'
                   AND used_at IS NULL AND expires_at > ?3",
                params![id, who.library_id, now],
            )?;
            if gone == 0 {
                return Ok(Err(ApiError::not_found()));
            }
            audit::record(&tx, &who, "invite.revoke", "invite", &id, None, now)?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}
