use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    auth::{guard::AuthUser, sessions::revoke_device, DeviceKind, Role},
    error::{ApiError, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/api/v1/devices", get(list_devices))
        .route("/api/v1/devices/{id}", axum::routing::patch(rename_device))
        .route("/api/v1/devices/{id}/revoke", post(revoke))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_devices, rename_device, revoke),
    components(schemas(DeviceOut, DeviceList, RenameDevice))
)]
pub struct Doc;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DeviceOut {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub user_id: String,
    pub user_name: String,
    pub paired_at: i64,
    pub last_seen: Option<i64>,
    pub revoked_at: Option<i64>,
    /// True only for the device making the request.
    pub current: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeviceList {
    pub devices: Vec<DeviceOut>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RenameDevice {
    pub name: String,
}

const SELECT: &str = "SELECT d.id, d.name, d.kind, d.user_id, u.display_name, \
                             d.paired_at, d.last_seen, d.revoked_at \
                      FROM devices d JOIN users u ON u.id = d.user_id";

fn map_row(row: &rusqlite::Row<'_>, current_id: &str) -> rusqlite::Result<DeviceOut> {
    let kind: String = row.get(2)?;
    let kind = match kind.as_str() {
        "mobile" => DeviceKind::Mobile,
        _ => DeviceKind::Desktop,
    };
    let id: String = row.get(0)?;
    Ok(DeviceOut {
        current: id == current_id,
        id,
        name: row.get(1)?,
        kind,
        user_id: row.get(3)?,
        user_name: row.get(4)?,
        paired_at: row.get(5)?,
        last_seen: row.get(6)?,
        revoked_at: row.get(7)?,
    })
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn is_manager(role: Role) -> bool {
    role.at_least(Role::Admin)
}

/// Loads a device of the caller's library; absence (or another library) is `None`.
fn find(
    conn: &Connection,
    library_id: &str,
    id: &str,
    current: &str,
) -> rusqlite::Result<Option<DeviceOut>> {
    conn.query_row(
        &format!("{SELECT} WHERE d.library_id = ?1 AND d.id = ?2"),
        params![library_id, id],
        |r| map_row(r, current),
    )
    .optional()
}

/// 404 when missing, 403 when a non-manager targets someone else's device.
fn authorize(user: &AuthUser, device: Option<DeviceOut>) -> ApiResult<DeviceOut> {
    let device = device.ok_or_else(ApiError::not_found)?;
    if device.user_id != user.user_id && !is_manager(user.role) {
        return Err(ApiError::forbidden());
    }
    Ok(device)
}

#[utoipa::path(
    get,
    path = "/api/v1/devices",
    tag = "devices",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Visible devices, newest first", body = DeviceList),
        (status = 401, description = "Not authenticated", body = crate::error::ApiErrorBody),
    )
)]
pub async fn list_devices(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<DeviceList>> {
    let devices = state
        .db
        .run(move |conn| {
            let all = is_manager(user.role);
            let sql = format!(
                "{SELECT} WHERE d.library_id = ?1 AND (?2 OR d.user_id = ?3) \
                 ORDER BY d.paired_at DESC, d.id DESC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params![user.library_id, all, user.user_id], |r| {
                map_row(r, &user.device_id)
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;
    Ok(Json(DeviceList { devices }))
}

#[utoipa::path(
    patch,
    path = "/api/v1/devices/{id}",
    tag = "devices",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Device id")),
    request_body = RenameDevice,
    responses(
        (status = 200, description = "Updated device", body = DeviceOut),
        (status = 401, description = "Not authenticated", body = crate::error::ApiErrorBody),
        (status = 403, description = "Not your device", body = crate::error::ApiErrorBody),
        (status = 404, description = "Unknown device", body = crate::error::ApiErrorBody),
        (status = 422, description = "Invalid name", body = crate::error::ApiErrorBody),
    )
)]
pub async fn rename_device(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<RenameDevice>,
) -> ApiResult<Json<DeviceOut>> {
    let name = body.name.trim().to_string();
    let device = state
        .db
        .run(move |conn| {
            let Some(found) = find(conn, &user.library_id, &id, &user.device_id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let found = match authorize(&user, Some(found)) {
                Ok(d) => d,
                Err(e) => return Ok(Err(e)),
            };
            if name.is_empty() || name.chars().count() > 80 {
                return Ok(Err(ApiError::validation(
                    "name must be between 1 and 80 characters",
                )));
            }
            conn.execute(
                "UPDATE devices SET name = ?1 WHERE id = ?2 AND library_id = ?3",
                params![name, found.id, user.library_id],
            )?;
            Ok(Ok(DeviceOut { name, ..found }))
        })
        .await??;
    Ok(Json(device))
}

#[utoipa::path(
    post,
    path = "/api/v1/devices/{id}/revoke",
    tag = "devices",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Device id")),
    responses(
        (status = 204, description = "Device revoked (idempotent)"),
        (status = 401, description = "Not authenticated", body = crate::error::ApiErrorBody),
        (status = 403, description = "Not your device", body = crate::error::ApiErrorBody),
        (status = 404, description = "Unknown device", body = crate::error::ApiErrorBody),
    )
)]
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state
        .db
        .run(move |conn| {
            let found = find(conn, &user.library_id, &id, &user.device_id)?;
            if let Err(e) = authorize(&user, found) {
                return Ok(Err(e));
            }
            revoke_device(conn, &user.library_id, &id, now_secs())?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}
