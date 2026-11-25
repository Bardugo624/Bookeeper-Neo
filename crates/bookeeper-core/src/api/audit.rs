use axum::{extract::State, routing::get, Json};
use rusqlite::types::Value as Sql;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{ApiQuery, Page},
    auth::{guard::AuthUser, Role},
    error::{ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/audit", get(list_audit))
        .route("/api/v1/audit/actions", get(list_actions))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(list_audit, list_actions),
    components(schemas(AuditOut, AuditList, AuditUser, AuditDevice, AuditActions, AuditQuery))
)]
pub struct Doc;

/// Author of an entry; `null` in the entry when the user was deleted.
#[derive(Debug, Serialize, ToSchema)]
pub struct AuditUser {
    pub id: String,
    pub display_name: String,
}

/// Device of an entry; `null` in the entry when the device was deleted.
#[derive(Debug, Serialize, ToSchema)]
pub struct AuditDevice {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditOut {
    pub id: i64,
    /// Unix seconds.
    pub at: i64,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub user: Option<AuditUser>,
    pub device: Option<AuditDevice>,
    /// Stored detail as a JSON object; `null` when absent or not valid JSON.
    /// The client address is never included.
    #[schema(value_type = Object, nullable = true)]
    pub detail: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditList {
    pub items: Vec<AuditOut>,
    pub total: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditActions {
    pub items: Vec<String>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams, ToSchema)]
pub struct AuditQuery {
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub action: Option<String>,
    pub entity_type: Option<String>,
    /// Inclusive, unix seconds.
    pub from: Option<i64>,
    /// Inclusive, unix seconds.
    pub to: Option<i64>,
    /// 1..=200, default 50.
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Removes every `ip` key, at any depth.
fn strip_ip(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(m) => {
            m.remove("ip");
            m.values_mut().for_each(strip_ip);
        }
        serde_json::Value::Array(a) => a.iter_mut().for_each(strip_ip),
        _ => {}
    }
}

fn parse_detail(raw: Option<String>) -> Option<serde_json::Value> {
    let mut v: serde_json::Value = serde_json::from_str(&raw?).ok()?;
    strip_ip(&mut v);
    Some(v)
}

#[utoipa::path(
    get,
    path = "/api/v1/audit",
    tag = "audit",
    security(("bearer" = [])),
    params(AuditQuery),
    responses(
        (status = 200, description = "Activity log, newest first", body = AuditList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: owner and admin only", body = ApiErrorBody),
        (status = 422, description = "validation: invalid query", body = ApiErrorBody),
    )
)]
pub async fn list_audit(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<AuditQuery>,
) -> ApiResult<Json<AuditList>> {
    who.require(Role::Admin)?;
    let (limit, offset) = Page {
        limit: q.limit,
        offset: q.offset,
    }
    .resolve()?;
    let opt_s = |v: Option<String>| v.map_or(Sql::Null, Sql::Text);
    let opt_i = |v: Option<i64>| v.map_or(Sql::Null, Sql::Integer);
    let filter_params = vec![
        Sql::Text(who.library_id.clone()),
        opt_s(q.user_id),
        opt_s(q.device_id),
        opt_s(q.action),
        opt_s(q.entity_type),
        opt_i(q.from),
        opt_i(q.to),
    ];
    let out = state
        .db
        .run(move |conn| {
            let filter = "WHERE a.library_id = ?1 \
                AND (?2 IS NULL OR a.user_id = ?2) \
                AND (?3 IS NULL OR a.device_id = ?3) \
                AND (?4 IS NULL OR a.action = ?4) \
                AND (?5 IS NULL OR a.entity_type = ?5) \
                AND (?6 IS NULL OR a.at >= ?6) \
                AND (?7 IS NULL OR a.at <= ?7)";
            let total: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM audit_log a {filter}"),
                rusqlite::params_from_iter(filter_params.iter()),
                |r| r.get(0),
            )?;
            let mut all = filter_params.clone();
            all.push(Sql::Integer(limit));
            all.push(Sql::Integer(offset));
            let mut stmt = conn.prepare(&format!(
                "SELECT a.id, a.at, a.action, a.entity_type, a.entity_id, \
                        u.id, u.display_name, d.id, d.name, a.detail_json \
                 FROM audit_log a \
                 LEFT JOIN users u ON u.id = a.user_id AND u.library_id = a.library_id \
                 LEFT JOIN devices d ON d.id = a.device_id AND d.library_id = a.library_id \
                 {filter} ORDER BY a.at DESC, a.id DESC LIMIT ?8 OFFSET ?9"
            ))?;
            let items = stmt
                .query_map(rusqlite::params_from_iter(all.iter()), |r| {
                    let uid: Option<String> = r.get(5)?;
                    let uname: Option<String> = r.get(6)?;
                    let did: Option<String> = r.get(7)?;
                    let dname: Option<String> = r.get(8)?;
                    Ok(AuditOut {
                        id: r.get(0)?,
                        at: r.get(1)?,
                        action: r.get(2)?,
                        entity_type: r.get(3)?,
                        entity_id: r.get(4)?,
                        user: uid.map(|id| AuditUser {
                            id,
                            display_name: uname.unwrap_or_default(),
                        }),
                        device: did.map(|id| AuditDevice {
                            id,
                            name: dname.unwrap_or_default(),
                        }),
                        detail: parse_detail(r.get(9)?),
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(AuditList { items, total })
        })
        .await?;
    Ok(Json(out))
}

#[utoipa::path(
    get,
    path = "/api/v1/audit/actions",
    tag = "audit",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Distinct actions present in the log", body = AuditActions),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 403, description = "forbidden: owner and admin only", body = ApiErrorBody),
    )
)]
pub async fn list_actions(
    State(state): State<AppState>,
    who: AuthUser,
) -> ApiResult<Json<AuditActions>> {
    who.require(Role::Admin)?;
    let items = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT action FROM audit_log WHERE library_id = ?1 ORDER BY action",
            )?;
            let rows = stmt
                .query_map([&who.library_id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    Ok(Json(AuditActions { items }))
}
