mod common;

use bookeeper_core::auth::sessions::{create_device, NewDevice};
use bookeeper_core::auth::{password, DeviceKind, Role, Session};
use bookeeper_core::AppState;
use common::{add_user, call, seed};
use serde_json::{json, Value};

const PW: &str = "correct horse";

fn login_body(email: &str, pw: &str) -> Value {
    json!({"email": email, "password": pw, "device_name": "Laptop", "device_kind": "desktop"})
}

async fn login(state: &AppState, body: Value) -> (u16, Value) {
    let (st, _, b) = call(state, "POST", "/api/v1/auth/login", None, Some(body)).await;
    (st, b)
}

async fn device_count(state: &AppState) -> i64 {
    state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM devices", [], |r| r.get(0)))
        .await
        .expect("count")
}

/// A second library with a user having this email and password.
async fn second_library(state: &AppState, email: &str, pw: &str) -> String {
    let lib = uuid::Uuid::now_v7().to_string();
    let uid = uuid::Uuid::now_v7().to_string();
    let hash = password::hash(pw).expect("hash");
    let (l, e) = (lib.clone(), email.to_string());
    state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Altra', 1)",
                [&l],
            )?;
            c.execute(
                "INSERT INTO users (id, library_id, email, password_hash, display_name, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, 'Zed', 'owner', 1)",
                rusqlite::params![uid, l, e, hash],
            )
        })
        .await
        .expect("second library");
    lib
}

async fn extra_device(state: &AppState, library_id: &str, user_id: &str) -> Session {
    let (lib, uid) = (library_id.to_string(), user_id.to_string());
    let secret = state.jwt_secret.clone();
    state
        .db
        .run(move |c| {
            create_device(
                c,
                &secret,
                NewDevice {
                    library_id: &lib,
                    user_id: &uid,
                    role: Role::Owner,
                    name: "Second",
                    kind: DeviceKind::Mobile,
                },
                chrono::Utc::now().timestamp(),
            )
        })
        .await
        .expect("device")
}

#[tokio::test]
async fn login_creates_a_new_device() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, b) = login(&s.state, login_body("ada@example.com", PW)).await;
    assert_eq!(st, 200);
    assert_ne!(b["session"]["device_id"], json!(s.session.device_id));
    assert_eq!(b["library"]["name"], "Casa");
    assert_eq!(b["user"]["id"], json!(s.user_id));
    assert_eq!(device_count(&s.state).await, 2);
}

#[tokio::test]
async fn login_is_case_and_space_insensitive_on_email() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, _) = login(&s.state, login_body("  ADA@Example.COM ", PW)).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn wrong_password_and_unknown_email_look_the_same() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let a = login(&s.state, login_body("ada@example.com", "wrong password")).await;
    let b = login(&s.state, login_body("nobody@example.com", "wrong password")).await;
    assert_eq!(a.0, 401);
    assert_eq!(a.1["error_code"], "invalid_credentials");
    assert_eq!(a, b);
}

#[tokio::test]
async fn user_without_password_cannot_log_in() {
    let s = seed(Role::Owner, Some("ada@example.com"), None).await;
    let (st, b) = login(&s.state, login_body("ada@example.com", "anything long")).await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "invalid_credentials");
}

#[tokio::test]
async fn same_email_in_two_libraries_needs_a_choice() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let other = second_library(&s.state, "ada@example.com", PW).await;
    let (st, b) = login(&s.state, login_body("ada@example.com", PW)).await;
    assert_eq!(st, 409);
    assert_eq!(b["error_code"], "library_choice_required");
    assert_eq!(device_count(&s.state).await, 1);

    let mut body = login_body("ada@example.com", PW);
    body["library_id"] = json!(other);
    let (st, b) = login(&s.state, body).await;
    assert_eq!(st, 200);
    assert_eq!(b["library"]["id"], json!(other));
}

#[tokio::test]
async fn libraries_lists_only_matching_ones() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    second_library(&s.state, "ada@example.com", "another password").await;
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/libraries",
        None,
        Some(json!({"email": "ada@example.com", "password": PW})),
    )
    .await;
    assert_eq!(st, 200);
    let libs = b["libraries"].as_array().expect("array");
    assert_eq!(libs.len(), 1);
    assert_eq!(libs[0]["id"], json!(s.library_id));
}

#[tokio::test]
async fn libraries_with_wrong_password_is_invalid_credentials() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/libraries",
        None,
        Some(json!({"email": "ada@example.com", "password": "wrong password"})),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "invalid_credentials");
}

#[tokio::test]
async fn refresh_returns_a_new_session_and_old_token_is_reused() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let old = s.session.refresh_token.clone();
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/refresh",
        None,
        Some(json!({"refresh_token": old})),
    )
    .await;
    assert_eq!(st, 200);
    let new_access = b["session"]["access_token"].as_str().expect("token");
    assert_ne!(b["session"]["refresh_token"], json!(old));

    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/refresh",
        None,
        Some(json!({"refresh_token": old})),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "refresh_reused");

    let (st, _, b) = call(&s.state, "GET", "/api/v1/me", Some(new_access), None).await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "device_revoked");
}

#[tokio::test]
async fn unknown_refresh_token_is_refresh_invalid() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/refresh",
        None,
        Some(json!({"refresh_token": "nope"})),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "refresh_invalid");
}

#[tokio::test]
async fn logout_revokes_this_device_only() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let other = extra_device(&s.state, &s.library_id, &s.user_id).await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/auth/logout",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/me",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("device_revoked"))
    );
    let (st, _, _) = call(
        &s.state,
        "GET",
        "/api/v1/me",
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn me_returns_library_user_and_device() {
    let s = seed(Role::Admin, Some("ada@example.com"), Some(PW)).await;
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/me",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(b["library"]["name"], "Casa");
    assert_eq!(b["user"]["display_name"], "Ada");
    assert_eq!(b["user"]["email"], "ada@example.com");
    assert_eq!(b["user"]["role"], "admin");
    assert_eq!(b["device"]["id"], json!(s.session.device_id));
    assert_eq!(b["device"]["current"], true);
    assert_eq!(b["device"]["kind"], "desktop");
}

async fn pw_call(s: &common::Seeded, token: &str, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/auth/password",
        Some(token),
        Some(body),
    )
    .await;
    (st, b)
}

#[tokio::test]
async fn set_first_password_without_current() {
    let s = seed(Role::Owner, Some("ada@example.com"), None).await;
    let (st, _) = pw_call(&s, &s.session.access_token, json!({"new_password": PW})).await;
    assert_eq!(st, 204);
    let (st, _) = login(&s.state, login_body("ada@example.com", PW)).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn change_password_requires_current() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, b) = pw_call(
        &s,
        &s.session.access_token,
        json!({"new_password": "brand new pass"}),
    )
    .await;
    assert_eq!(st, 409);
    assert_eq!(b["error_code"], "password_required");
    let (st, _) = pw_call(
        &s,
        &s.session.access_token,
        json!({"current_password": PW, "new_password": "brand new pass"}),
    )
    .await;
    assert_eq!(st, 204);
    let (st, _) = login(&s.state, login_body("ada@example.com", "brand new pass")).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn wrong_current_password_is_invalid_credentials() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, b) = pw_call(
        &s,
        &s.session.access_token,
        json!({"current_password": "not the one", "new_password": "brand new pass"}),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "invalid_credentials");
}

#[tokio::test]
async fn changing_password_revokes_other_devices() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let other = extra_device(&s.state, &s.library_id, &s.user_id).await;
    let (_, bob) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let (st, _) = pw_call(
        &s,
        &s.session.access_token,
        json!({"current_password": PW, "new_password": "brand new pass"}),
    )
    .await;
    assert_eq!(st, 204);
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/me",
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("device_revoked"))
    );
    let (st, _, _) = call(
        &s.state,
        "GET",
        "/api/v1/me",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    let (st, _, _) = call(&s.state, "GET", "/api/v1/me", Some(&bob.access_token), None).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn setting_a_password_without_email_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let (st, b) = pw_call(&s, &s.session.access_token, json!({"new_password": PW})).await;
    assert_eq!(st, 422);
    assert_eq!(b["error_code"], "validation");
    assert_eq!(
        b["message"],
        "an email is required before setting a password"
    );
}

#[tokio::test]
async fn protected_routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    for (method, path, body) in [
        ("GET", "/api/v1/me", None),
        ("POST", "/api/v1/auth/logout", None),
        (
            "POST",
            "/api/v1/auth/password",
            Some(json!({"new_password": PW})),
        ),
    ] {
        let (st, _, b) = call(&s.state, method, path, None, body).await;
        assert_eq!(st, 401, "{path}");
        assert_eq!(b["error_code"], "unauthorized", "{path}");
    }
}
