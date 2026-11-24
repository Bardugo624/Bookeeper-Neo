mod common;

use bookeeper_core::auth::sessions::{create_device, NewDevice};
use bookeeper_core::auth::{DeviceKind, Role, Session};
use bookeeper_core::AppState;
use common::{add_user, call, seed};
use serde_json::{json, Value};

fn tok(s: &Session) -> &str {
    &s.access_token
}

fn devices(body: &Value) -> &Vec<Value> {
    body["devices"].as_array().expect("devices array")
}

async fn second_library(state: &AppState) -> Session {
    let secret = state.jwt_secret.clone();
    state
        .db
        .run(move |conn| {
            let lib = uuid::Uuid::now_v7().to_string();
            let uid = uuid::Uuid::now_v7().to_string();
            conn.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Altra', 1)",
                [&lib],
            )?;
            conn.execute(
                "INSERT INTO users (id, library_id, display_name, role, created_at) \
                 VALUES (?1, ?2, 'Eve', 'owner', 1)",
                [&uid, &lib],
            )?;
            create_device(
                conn,
                &secret,
                NewDevice {
                    library_id: &lib,
                    user_id: &uid,
                    role: Role::Owner,
                    name: "Other",
                    kind: DeviceKind::Desktop,
                },
                chrono::Utc::now().timestamp(),
            )
        })
        .await
        .expect("second library")
}

#[tokio::test]
async fn member_sees_only_own_devices() {
    let s = seed(Role::Owner, None, None).await;
    let (uid, sess) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let (st, _, body) = call(&s.state, "GET", "/api/v1/devices", Some(tok(&sess)), None).await;
    assert_eq!(st, 200);
    let list = devices(&body);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["user_id"], uid);
    assert_eq!(list[0]["user_name"], "Bob");
}

#[tokio::test]
async fn admin_sees_every_device_of_the_library() {
    let s = seed(Role::Owner, None, None).await;
    add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let (_, admin) = add_user(&s.state, &s.library_id, Role::Admin, "Cy").await;
    let (st, _, body) = call(&s.state, "GET", "/api/v1/devices", Some(tok(&admin)), None).await;
    assert_eq!(st, 200);
    assert_eq!(devices(&body).len(), 3);
}

#[tokio::test]
async fn list_marks_the_current_device() {
    let s = seed(Role::Owner, None, None).await;
    add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let (_, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/devices",
        Some(tok(&s.session)),
        None,
    )
    .await;
    let current: Vec<_> = devices(&body)
        .iter()
        .filter(|d| d["current"] == true)
        .collect();
    assert_eq!(current.len(), 1);
    assert_eq!(current[0]["id"], s.session.device_id);
}

#[tokio::test]
async fn list_never_shows_another_library() {
    let s = seed(Role::Owner, None, None).await;
    second_library(&s.state).await;
    let (_, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/devices",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!(devices(&body).len(), 1);
    assert_eq!(devices(&body)[0]["id"], s.session.device_id);
}

#[tokio::test]
async fn rename_own_device() {
    let s = seed(Role::Member, None, None).await;
    let path = format!("/api/v1/devices/{}", s.session.device_id);
    let (st, _, body) = call(
        &s.state,
        "PATCH",
        &path,
        Some(tok(&s.session)),
        Some(json!({"name": "  Studio  "})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(body["name"], "Studio");
    let (_, _, list) = call(
        &s.state,
        "GET",
        "/api/v1/devices",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!(devices(&list)[0]["name"], "Studio");
}

#[tokio::test]
async fn rename_validates_the_name() {
    let s = seed(Role::Member, None, None).await;
    let path = format!("/api/v1/devices/{}", s.session.device_id);
    for name in [String::new(), "x".repeat(81)] {
        let (st, _, body) = call(
            &s.state,
            "PATCH",
            &path,
            Some(tok(&s.session)),
            Some(json!({"name": name})),
        )
        .await;
        assert_eq!(st, 422);
        assert_eq!(body["error_code"], "validation");
    }
}

#[tokio::test]
async fn member_cannot_rename_someone_elses_device() {
    let s = seed(Role::Owner, None, None).await;
    let (_, sess) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let path = format!("/api/v1/devices/{}", s.session.device_id);
    let (st, _, body) = call(
        &s.state,
        "PATCH",
        &path,
        Some(tok(&sess)),
        Some(json!({"name": "Mine"})),
    )
    .await;
    assert_eq!(st, 403);
    assert_eq!(body["error_code"], "forbidden");
}

#[tokio::test]
async fn admin_can_rename_any_device_of_the_library() {
    let s = seed(Role::Owner, None, None).await;
    let (_, sess) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let path = format!("/api/v1/devices/{}", sess.device_id);
    let (st, _, body) = call(
        &s.state,
        "PATCH",
        &path,
        Some(tok(&s.session)),
        Some(json!({"name": "Renamed"})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(body["name"], "Renamed");
    assert_eq!(body["user_name"], "Bob");
    assert_eq!(body["current"], false);
}

#[tokio::test]
async fn revoke_own_other_device() {
    let s = seed(Role::Owner, None, None).await;
    let (_, sess) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let path = format!("/api/v1/devices/{}/revoke", sess.device_id);
    let (st, _, _) = call(&s.state, "POST", &path, Some(tok(&s.session)), None).await;
    assert_eq!(st, 204);
    let (st, _, body) = call(&s.state, "GET", "/api/v1/devices", Some(tok(&sess)), None).await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "device_revoked");
    let (_, _, list) = call(
        &s.state,
        "GET",
        "/api/v1/devices",
        Some(tok(&s.session)),
        None,
    )
    .await;
    let revoked = devices(&list)
        .iter()
        .find(|d| d["id"] == sess.device_id)
        .expect("listed");
    assert!(revoked["revoked_at"].is_i64());
}

#[tokio::test]
async fn revoke_is_idempotent() {
    let s = seed(Role::Owner, None, None).await;
    let (_, sess) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let path = format!("/api/v1/devices/{}/revoke", sess.device_id);
    for _ in 0..2 {
        let (st, _, _) = call(&s.state, "POST", &path, Some(tok(&s.session)), None).await;
        assert_eq!(st, 204);
    }
}

#[tokio::test]
async fn device_can_revoke_itself() {
    let s = seed(Role::Member, None, None).await;
    let path = format!("/api/v1/devices/{}/revoke", s.session.device_id);
    let (st, _, _) = call(&s.state, "POST", &path, Some(tok(&s.session)), None).await;
    assert_eq!(st, 204);
    let (st, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/devices",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "device_revoked");
}

#[tokio::test]
async fn device_of_another_library_is_not_found() {
    let s = seed(Role::Owner, None, None).await;
    let other = second_library(&s.state).await;
    let id = &other.device_id;
    let (st, _, body) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/devices/{id}"),
        Some(tok(&s.session)),
        Some(json!({"name": "Hacked"})),
    )
    .await;
    assert_eq!((st, body["error_code"].as_str()), (404, Some("not_found")));
    let (st, _, body) = call(
        &s.state,
        "POST",
        &format!("/api/v1/devices/{id}/revoke"),
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!((st, body["error_code"].as_str()), (404, Some("not_found")));
    let (st, _, list) = call(&s.state, "GET", "/api/v1/devices", Some(tok(&other)), None).await;
    assert_eq!(st, 200);
    assert_eq!(devices(&list)[0]["name"], "Other");
    assert!(devices(&list)[0]["revoked_at"].is_null());
}

#[tokio::test]
async fn unknown_and_malformed_ids_are_not_found() {
    let s = seed(Role::Owner, None, None).await;
    let unknown = uuid::Uuid::now_v7().to_string();
    for id in [unknown.as_str(), "abc"] {
        let (st, _, body) = call(
            &s.state,
            "PATCH",
            &format!("/api/v1/devices/{id}"),
            Some(tok(&s.session)),
            Some(json!({"name": "X"})),
        )
        .await;
        assert_eq!((st, body["error_code"].as_str()), (404, Some("not_found")));
        let (st, _, body) = call(
            &s.state,
            "POST",
            &format!("/api/v1/devices/{id}/revoke"),
            Some(tok(&s.session)),
            None,
        )
        .await;
        assert_eq!((st, body["error_code"].as_str()), (404, Some("not_found")));
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let id = &s.session.device_id;
    let calls = [
        ("GET", "/api/v1/devices".to_string(), None),
        (
            "PATCH",
            format!("/api/v1/devices/{id}"),
            Some(json!({"name": "X"})),
        ),
        ("POST", format!("/api/v1/devices/{id}/revoke"), None),
    ];
    for (method, path, body) in calls {
        let (st, _, resp) = call(&s.state, method, &path, None, body).await;
        assert_eq!(st, 401, "{method} {path}");
        assert_eq!(resp["error_code"], "unauthorized");
    }
}
