#![allow(dead_code)]

use axum::body::Body;
use axum::http::{HeaderMap, Request};
use bookeeper_core::auth::sessions::{create_device, NewDevice};
use bookeeper_core::auth::{password, DeviceKind, Role, Session};
use bookeeper_core::{router, AppState};
use http_body_util::BodyExt;
use tower::ServiceExt;

pub struct Seeded {
    pub state: AppState,
    pub library_id: String,
    pub user_id: String,
    pub session: Session,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Library "Casa", user "Ada" with that role, optional email and password, one desktop device.
pub async fn seed(role: Role, email: Option<&str>, password: Option<&str>) -> Seeded {
    let state = AppState::for_tests();
    let library_id = uuid::Uuid::now_v7().to_string();
    let user_id = uuid::Uuid::now_v7().to_string();
    let hash = password.map(|p| password::hash(p).expect("hash"));
    let secret = state.jwt_secret.clone();
    let (lib, uid, email) = (
        library_id.clone(),
        user_id.clone(),
        email.map(str::to_string),
    );
    let session = state
        .db
        .run(move |conn| {
            let t = now();
            conn.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Casa', ?2)",
                rusqlite::params![lib, t],
            )?;
            conn.execute(
                "INSERT INTO users (id, library_id, email, password_hash, display_name, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, 'Ada', ?5, ?6)",
                rusqlite::params![uid, lib, email, hash, role.as_str(), t],
            )?;
            create_device(
                conn,
                &secret,
                NewDevice {
                    library_id: &lib,
                    user_id: &uid,
                    role,
                    name: "Desktop",
                    kind: DeviceKind::Desktop,
                },
                t,
            )
        })
        .await
        .expect("seed");
    Seeded {
        state,
        library_id,
        user_id,
        session,
    }
}

/// Adds a user with one device to an existing library.
pub async fn add_user(
    state: &AppState,
    library_id: &str,
    role: Role,
    name: &str,
) -> (String, Session) {
    let user_id = uuid::Uuid::now_v7().to_string();
    let secret = state.jwt_secret.clone();
    let (lib, uid, name) = (library_id.to_string(), user_id.clone(), name.to_string());
    let session = state
        .db
        .run(move |conn| {
            let t = now();
            conn.execute(
                "INSERT INTO users (id, library_id, display_name, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![uid, lib, name, role.as_str(), t],
            )?;
            create_device(
                conn,
                &secret,
                NewDevice {
                    library_id: &lib,
                    user_id: &uid,
                    role,
                    name: "Phone",
                    kind: DeviceKind::Mobile,
                },
                t,
            )
        })
        .await
        .expect("add_user");
    (user_id, session)
}

/// Sends a JSON request to the router; returns (status, headers, JSON body or Null).
pub async fn call(
    state: &AppState,
    method: &str,
    path: &str,
    bearer: Option<&str>,
    body: Option<serde_json::Value>,
) -> (u16, HeaderMap, serde_json::Value) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(token) = bearer {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .expect("request");
    let resp = router(state.clone()).oneshot(req).await.expect("response");
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp.into_body().collect().await.expect("body").to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, headers, json)
}
