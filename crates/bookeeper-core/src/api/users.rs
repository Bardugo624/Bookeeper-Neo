//! People of the library: list, rename, change role, remove, transfer ownership.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::audit;
use crate::auth::{guard::AuthUser, Role};
use crate::error::{ApiError, ApiErrorBody, ApiResult};
use crate::extract::ApiJson;
use crate::state::AppState;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/users", get(list_users))
        .route(
            "/api/v1/users/{id}",
            axum::routing::patch(update_user).delete(remove_user),
        )
        .route("/api/v1/users/{id}/owner", post(transfer_owner))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_users, update_user, remove_user, transfer_owner),
    components(schemas(PersonOut, PeopleList, PatchPerson))
)]
pub struct Doc;

#[derive(Debug, Serialize, ToSchema)]
pub struct PersonOut {
    pub id: String,
    pub display_name: String,
    pub role: Role,
    pub is_me: bool,
    pub created_at: i64,
    /// The most recent `last_seen` among the person's devices.
    pub last_seen: Option<i64>,
    /// Devices that are not revoked.
    pub devices: i64,
    /// Only for admins and the owner, and only when the person has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PeopleList {
    pub items: Vec<PersonOut>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PatchPerson {
    /// 1 to 60 characters after trimming.
    pub display_name: Option<String>,
    /// `admin`, `member` or `guest`.
    pub role: Option<String>,
}

/// A change to a person, as the rules of "who manages whom" see it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Rename,
    /// To this role.
    SetRole(Role),
    Remove,
}

/// The one place where "who manages whom" lives.
///
/// The owner manages everyone but themselves; an admin manages members and guests; nobody
/// manages the owner. Everyone renames themselves, and everyone but the owner may remove
/// themselves. The owner can assign `admin|member|guest`, an admin `member|guest`.
pub fn may(actor: Role, is_self: bool, target: Role, change: Change) -> bool {
    let manages = match actor {
        Role::Owner => !is_self && target != Role::Owner,
        Role::Admin => matches!(target, Role::Member | Role::Guest),
        Role::Member | Role::Guest => false,
    };
    match change {
        Change::Rename => is_self || manages,
        Change::Remove => (is_self && actor != Role::Owner) || manages,
        Change::SetRole(new) => {
            manages
                && match actor {
                    Role::Owner => new != Role::Owner,
                    Role::Admin => matches!(new, Role::Member | Role::Guest),
                    Role::Member | Role::Guest => false,
                }
        }
    }
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

const SELECT: &str = "SELECT u.id, u.display_name, u.role, u.created_at, u.email, \
        (SELECT MAX(d.last_seen) FROM devices d WHERE d.user_id = u.id AND d.revoked_at IS NULL), \
        (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.revoked_at IS NULL) \
     FROM users u";

fn map_row(row: &rusqlite::Row<'_>, who: &AuthUser) -> rusqlite::Result<PersonOut> {
    let id: String = row.get(0)?;
    let role: String = row.get(2)?;
    let email: Option<String> = row.get(4)?;
    Ok(PersonOut {
        is_me: id == who.user_id,
        id,
        display_name: row.get(1)?,
        role: role.parse().unwrap_or(Role::Guest),
        created_at: row.get(3)?,
        email: email.filter(|_| who.role.at_least(Role::Admin)),
        last_seen: row.get(5)?,
        devices: row.get(6)?,
    })
}

fn fetch(conn: &Connection, who: &AuthUser, id: &str) -> rusqlite::Result<Option<PersonOut>> {
    conn.query_row(
        &format!("{SELECT} WHERE u.library_id = ?1 AND u.id = ?2"),
        params![who.library_id, id],
        |r| map_row(r, who),
    )
    .optional()
}

fn target_role(conn: &Connection, who: &AuthUser, id: &str) -> rusqlite::Result<Option<Role>> {
    let role: Option<String> = conn
        .query_row(
            "SELECT role FROM users WHERE library_id = ?1 AND id = ?2",
            params![who.library_id, id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(role.and_then(|r| r.parse().ok()))
}

#[utoipa::path(
    get,
    path = "/api/v1/users",
    tag = "users",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Everyone in the library: owner, admins, members, guests; then by name", body = PeopleList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn list_users(
    State(state): State<AppState>,
    who: AuthUser,
) -> ApiResult<Json<PeopleList>> {
    let items = state
        .db
        .run(move |conn| {
            let sql = format!(
                "{SELECT} WHERE u.library_id = ?1 ORDER BY CASE u.role WHEN 'owner' THEN 0 \
                 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, \
                 ulower(u.display_name), u.id"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([&who.library_id], |r| map_row(r, &who))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;
    Ok(Json(PeopleList { items }))
}

#[utoipa::path(
    patch,
    path = "/api/v1/users/{id}",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Person id")),
    request_body = PatchPerson,
    responses(
        (status = 200, description = "Updated person", body = PersonOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: not allowed to manage this person", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown person", body = ApiErrorBody),
        (status = 422, description = "validation: invalid name, or role owner or unknown", body = ApiErrorBody),
    )
)]
pub async fn update_user(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PatchPerson>,
) -> ApiResult<Json<PersonOut>> {
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(target) = target_role(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let is_self = id == who.user_id;
            // Authorization first; a role the API never assigns is a validation error.
            let new_role = match body.role.as_deref() {
                None => None,
                Some(r) => match r.parse::<Role>() {
                    Ok(Role::Owner) | Err(_) => None,
                    Ok(role) => Some(role),
                },
            };
            let mut allowed = true;
            if body.display_name.is_some() || body.role.is_none() {
                allowed &= may(who.role, is_self, target, Change::Rename);
            }
            if body.role.is_some() {
                allowed &= match new_role {
                    Some(role) => may(who.role, is_self, target, Change::SetRole(role)),
                    // owner/unknown: only the people who could change a role at all
                    None => may(who.role, is_self, target, Change::SetRole(Role::Guest)),
                };
            }
            if !allowed {
                return Ok(Err(ApiError::forbidden()));
            }
            if body.role.is_some() && new_role.is_none() {
                return Ok(Err(ApiError::validation(
                    "role must be admin, member or guest",
                )));
            }
            let name = match body.display_name.as_deref().map(str::trim) {
                None => None,
                Some(n) if n.is_empty() || n.chars().count() > 60 => {
                    return Ok(Err(ApiError::validation(
                        "display_name must be 1 to 60 characters",
                    )));
                }
                Some(n) => Some(n.to_string()),
            };
            let current = fetch(&tx, &who, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            let mut changed = serde_json::Map::new();
            if let Some(n) = name.filter(|n| *n != current.display_name) {
                tx.execute(
                    "UPDATE users SET display_name = ?1 WHERE id = ?2 AND library_id = ?3",
                    params![n, id, who.library_id],
                )?;
                changed.insert("display_name".into(), n.into());
            }
            if let Some(r) = new_role.filter(|r| *r != current.role) {
                tx.execute(
                    "UPDATE users SET role = ?1 WHERE id = ?2 AND library_id = ?3",
                    params![r.as_str(), id, who.library_id],
                )?;
                changed.insert("role".into(), r.as_str().into());
            }
            if !changed.is_empty() {
                audit::record(
                    &tx,
                    &who,
                    "user.update",
                    "user",
                    &id,
                    Some(&serde_json::Value::Object(changed)),
                    now_secs(),
                )?;
            }
            let out = fetch(&tx, &who, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            tx.commit()?;
            Ok(Ok(out))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/users/{id}",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Person id")),
    responses(
        (status = 204, description = "Person removed (or left the library)"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: not allowed to remove this person", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown person", body = ApiErrorBody),
    )
)]
pub async fn remove_user(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(target) = target_role(&tx, &who, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            if !may(who.role, id == who.user_id, target, Change::Remove) {
                return Ok(Err(ApiError::forbidden()));
            }
            let name: String =
                tx.query_row("SELECT display_name FROM users WHERE id = ?1", [&id], |r| {
                    r.get(0)
                })?;
            audit::record(
                &tx,
                &who,
                "user.remove",
                "user",
                &id,
                Some(&serde_json::json!({ "display_name": name })),
                now_secs(),
            )?;
            // Devices, reading state, wishlist and created codes cascade; book owners and
            // loan borrowers go back to NULL.
            tx.execute(
                "DELETE FROM users WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/users/{id}/owner",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Person id")),
    responses(
        (status = 204, description = "The person is the owner now; the caller is an admin"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: only the owner can transfer ownership", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown person", body = ApiErrorBody),
        (status = 422, description = "validation: the person is the caller", body = ApiErrorBody),
    )
)]
pub async fn transfer_owner(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Owner)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if target_role(&tx, &who, &id)?.is_none() {
                return Ok(Err(ApiError::not_found()));
            }
            if id == who.user_id {
                return Ok(Err(ApiError::validation("Ownership is already yours")));
            }
            // The unique index on the owner needs the caller to step down first.
            tx.execute(
                "UPDATE users SET role = 'admin' WHERE id = ?1 AND library_id = ?2",
                params![who.user_id, who.library_id],
            )?;
            tx.execute(
                "UPDATE users SET role = 'owner' WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            audit::record(
                &tx,
                &who,
                "library.owner",
                "library",
                &who.library_id,
                Some(&serde_json::json!({ "from": who.user_id, "to": id })),
                now_secs(),
            )?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROLES: [Role; 4] = [Role::Owner, Role::Admin, Role::Member, Role::Guest];

    /// Independent restatement of the table in the contract.
    fn expected(actor: Role, is_self: bool, target: Role, change: Change) -> bool {
        let manages = match (actor, target) {
            (Role::Owner, Role::Owner) => false,
            (Role::Owner, _) => !is_self,
            (Role::Admin, Role::Member | Role::Guest) => true,
            _ => false,
        };
        match change {
            Change::Rename => is_self || manages,
            Change::Remove => (is_self && actor != Role::Owner) || manages,
            Change::SetRole(new) => {
                manages
                    && match actor {
                        Role::Owner => new != Role::Owner,
                        _ => matches!(new, Role::Member | Role::Guest),
                    }
            }
        }
    }

    #[test]
    fn every_pair_of_roles_follows_the_contract() {
        for actor in ROLES {
            for target in ROLES {
                for is_self in [false, true] {
                    let mut changes = vec![Change::Rename, Change::Remove];
                    changes.extend(ROLES.map(Change::SetRole));
                    for change in changes {
                        assert_eq!(
                            may(actor, is_self, target, change),
                            expected(actor, is_self, target, change),
                            "{actor:?} self={is_self} on {target:?}: {change:?}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn spot_checks() {
        use Change::*;
        assert!(may(Role::Owner, false, Role::Admin, SetRole(Role::Guest)));
        assert!(!may(Role::Owner, false, Role::Member, SetRole(Role::Owner)));
        assert!(!may(Role::Owner, true, Role::Owner, Remove));
        assert!(may(Role::Owner, true, Role::Owner, Rename));
        assert!(may(Role::Admin, false, Role::Guest, Remove));
        assert!(!may(Role::Admin, false, Role::Member, SetRole(Role::Admin)));
        assert!(!may(Role::Admin, false, Role::Admin, Rename));
        assert!(!may(Role::Admin, false, Role::Owner, Remove));
        assert!(may(Role::Admin, true, Role::Admin, Remove));
        assert!(!may(Role::Admin, true, Role::Admin, SetRole(Role::Member)));
        assert!(may(Role::Guest, true, Role::Guest, Remove));
        assert!(!may(Role::Member, false, Role::Guest, Rename));
    }
}
