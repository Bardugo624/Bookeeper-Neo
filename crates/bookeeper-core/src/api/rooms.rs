use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{new_id, now_secs},
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/rooms", get(list_rooms).post(create_room))
        .route("/api/v1/rooms/{id}", patch(patch_room).delete(delete_room))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_rooms, create_room, patch_room, delete_room),
    components(schemas(RoomOut, RoomList, RoomSummary, CreateRoom, PatchRoom))
)]
pub struct Doc;

const MAX_NAME: usize = 60;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RoomOut {
    pub id: String,
    pub name: String,
    /// Shelves of the library placed in the room.
    pub shelf_count: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RoomList {
    pub items: Vec<RoomOut>,
}

/// A room as shown inside a shelf.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct RoomSummary {
    pub id: String,
    pub name: String,
}

/// Body of `POST /rooms`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRoom {
    /// 1 to 60 characters, unique in the library ignoring case and outer spaces.
    pub name: String,
}

/// Body of `PATCH /rooms/{id}`: absent = unchanged.
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct PatchRoom {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub name: Option<Option<String>>,
}

/// Distinguishes an absent field (`None`) from an explicit `null` (`Some(None)`).
fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

fn check_name(raw: &str) -> ApiResult<String> {
    let n = raw.trim();
    if !(1..=MAX_NAME).contains(&n.chars().count()) {
        return Err(ApiError::validation(format!(
            "name must be between 1 and {MAX_NAME} characters"
        )));
    }
    Ok(n.to_string())
}

fn exists_error() -> ApiError {
    ApiError::conflict("room_exists", "a room with this name already exists")
}

/// Whether another room of the library has this name, ignoring case.
fn name_taken(
    conn: &Connection,
    library_id: &str,
    name: &str,
    except: Option<&str>,
) -> rusqlite::Result<bool> {
    let wanted = name.to_lowercase();
    let mut stmt = conn.prepare("SELECT id, name FROM rooms WHERE library_id = ?1")?;
    let rows = stmt.query_map([library_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, n) = row?;
        if Some(id.as_str()) != except && n.trim().to_lowercase() == wanted {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Whether the room exists in the library.
pub fn room_exists(conn: &Connection, library_id: &str, id: &str) -> rusqlite::Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM rooms WHERE id = ?1 AND library_id = ?2",
            params![id, library_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

const SELECT_ROOM: &str = "SELECT r.id, r.name, \
    (SELECT COUNT(*) FROM shelves s WHERE s.room_id = r.id AND s.library_id = r.library_id), \
    r.created_at FROM rooms r";

fn map_room(r: &rusqlite::Row<'_>) -> rusqlite::Result<RoomOut> {
    Ok(RoomOut {
        id: r.get(0)?,
        name: r.get(1)?,
        shelf_count: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn fetch(conn: &Connection, library_id: &str, id: &str) -> rusqlite::Result<Option<RoomOut>> {
    conn.query_row(
        &format!("{SELECT_ROOM} WHERE r.library_id = ?1 AND r.id = ?2"),
        params![library_id, id],
        map_room,
    )
    .optional()
}

#[utoipa::path(
    get,
    path = "/api/v1/rooms",
    tag = "rooms",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "The library's rooms, by name", body = RoomList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn list_rooms(State(state): State<AppState>, who: AuthUser) -> ApiResult<Json<RoomList>> {
    let items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(&format!(
                "{SELECT_ROOM} WHERE r.library_id = ?1 ORDER BY r.name COLLATE NOCASE, r.id"
            ))?;
            let rows = stmt
                .query_map([&who.library_id], map_room)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    Ok(Json(RoomList { items }))
}

#[utoipa::path(
    post,
    path = "/api/v1/rooms",
    tag = "rooms",
    security(("bearer" = [])),
    request_body = CreateRoom,
    responses(
        (status = 201, description = "Created room", body = RoomOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 409, description = "room_exists: the name is taken", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn create_room(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<CreateRoom>,
) -> ApiResult<(StatusCode, Json<RoomOut>)> {
    who.require(Role::Member)?;
    let name = check_name(&body.name)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if name_taken(&tx, &who.library_id, &name, None)? {
                return Ok(Err(exists_error()));
            }
            let (id, now) = (new_id(), now_secs());
            tx.execute(
                "INSERT INTO rooms (id, library_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![id, who.library_id, name, now],
            )?;
            audit::record(
                &tx,
                &who,
                "room.create",
                "room",
                &id,
                Some(&serde_json::json!({ "name": name })),
                now,
            )?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    patch,
    path = "/api/v1/rooms/{id}",
    tag = "rooms",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Room id")),
    request_body = PatchRoom,
    responses(
        (status = 200, description = "Updated room", body = RoomOut),
        (status = 400, description = "bad_request: malformed JSON or wrong content type", body = ApiErrorBody),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown room", body = ApiErrorBody),
        (status = 409, description = "room_exists: the name is taken", body = ApiErrorBody),
        (status = 422, description = "validation: invalid body", body = ApiErrorBody),
    )
)]
pub async fn patch_room(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PatchRoom>,
) -> ApiResult<Json<RoomOut>> {
    who.require(Role::Member)?;
    let name = match body.name {
        None => None,
        Some(None) => return Err(ApiError::validation("name cannot be null")),
        Some(Some(n)) => Some(check_name(&n)?),
    };
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(cur) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let name = name.unwrap_or(cur.name);
            if name_taken(&tx, &who.library_id, &name, Some(&id))? {
                return Ok(Err(exists_error()));
            }
            tx.execute(
                "UPDATE rooms SET name = ?1 WHERE id = ?2 AND library_id = ?3",
                params![name, id, who.library_id],
            )?;
            audit::record(&tx, &who, "room.update", "room", &id, None, now_secs())?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/rooms/{id}",
    tag = "rooms",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Room id")),
    responses(
        (status = 204, description = "Deleted; its shelves stay, without a room"),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: role too low", body = ApiErrorBody),
        (status = 404, description = "not_found: unknown room", body = ApiErrorBody),
    )
)]
pub async fn delete_room(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            if !room_exists(&tx, &who.library_id, &id)? {
                return Ok(Err(ApiError::not_found()));
            }
            // Explicit, so it does not depend on the foreign keys pragma.
            tx.execute(
                "UPDATE shelves SET room_id = NULL WHERE room_id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            tx.execute(
                "DELETE FROM rooms WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            audit::record(&tx, &who, "room.delete", "room", &id, None, now_secs())?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}
