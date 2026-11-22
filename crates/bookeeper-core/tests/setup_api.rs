mod common;

use bookeeper_core::api::setup::new_setup_code;
use bookeeper_core::auth::tokens::verify_access;
use bookeeper_core::db::Db;
use bookeeper_core::state::SetupPolicy;
use bookeeper_core::AppState;
use common::call;
use serde_json::{json, Value};

fn server_state() -> AppState {
    AppState::open(Db::open_in_memory().expect("db"), SetupPolicy::CodeRequired).expect("state")
}

async fn code(state: &AppState) -> String {
    state.db.run(new_setup_code).await.expect("code")
}

fn body(extra: Value) -> Value {
    let mut b = json!({
        "library_name": "Casa",
        "display_name": "Ada",
        "device_name": "Laptop",
        "device_kind": "desktop",
    });
    for (k, v) in extra.as_object().expect("object") {
        b[k] = v.clone();
    }
    b
}

fn server_body(code: &str) -> Value {
    body(json!({"email": "ada@example.com", "password": "correct horse", "setup_code": code}))
}

async fn count(state: &AppState, table: &'static str) -> i64 {
    state
        .db
        .run(move |c| c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)))
        .await
        .expect("count")
}

async fn post(state: &AppState, b: Value) -> (u16, Value) {
    let (status, _, json) = call(state, "POST", "/api/v1/setup", None, Some(b)).await;
    (status, json)
}

#[tokio::test]
async fn status_on_empty_database() {
    let state = AppState::for_tests();
    let (status, _, json) = call(&state, "GET", "/api/v1/setup", None, None).await;
    assert_eq!(status, 200);
    assert_eq!(json, json!({"needs_setup": true, "code_required": false}));
}

#[tokio::test]
async fn open_setup_without_password() {
    let state = AppState::for_tests();
    let (status, json) = post(&state, body(json!({}))).await;
    assert_eq!(status, 201);
    assert_eq!(json["user"]["role"], "owner");
    assert_eq!(json["user"]["email"], Value::Null);
    assert_eq!(json["library"]["name"], "Casa");
    let token = json["session"]["access_token"].as_str().expect("token");
    let claims = verify_access(&state.jwt_secret, token, chrono::Utc::now().timestamp())
        .expect("valid token");
    assert_eq!(claims.lid, json["library"]["id"].as_str().expect("id"));
    assert_eq!(claims.uid, json["user"]["id"].as_str().expect("id"));
}

#[tokio::test]
async fn open_setup_is_closed_after_the_first_library() {
    let state = AppState::for_tests();
    assert_eq!(post(&state, body(json!({}))).await.0, 201);
    let (status, json) = post(&state, body(json!({}))).await;
    assert_eq!(status, 409);
    assert_eq!(json["error_code"], "setup_closed");
    let (_, _, json) = call(&state, "GET", "/api/v1/setup", None, None).await;
    assert_eq!(json["needs_setup"], false);
    assert_eq!(count(&state, "libraries").await, 1);
}

#[tokio::test]
async fn code_required_rejects_missing_and_wrong_codes() {
    let state = server_state();
    let real = code(&state).await;
    let (_, _, status) = call(&state, "GET", "/api/v1/setup", None, None).await;
    assert_eq!(status["code_required"], true);

    let mut missing = server_body(&real);
    missing
        .as_object_mut()
        .expect("object")
        .remove("setup_code");
    for b in [missing, server_body("AAAA-AAAA-AAAA")] {
        let (status, json) = post(&state, b).await;
        assert_eq!(status, 403);
        assert_eq!(json["error_code"], "setup_code_invalid");
    }
    assert_eq!(count(&state, "libraries").await, 0);

    // No code generated at all.
    let fresh = server_state();
    let (status, json) = post(&fresh, server_body("AAAA-AAAA-AAAA")).await;
    assert_eq!(status, 403);
    assert_eq!(json["error_code"], "setup_code_invalid");
}

#[tokio::test]
async fn code_required_accepts_the_code_in_any_case_and_spacing() {
    let state = server_state();
    let real = code(&state).await;
    let sloppy = format!(" {} ", real.replace('-', "").to_lowercase());
    let (status, _) = post(&state, server_body(&sloppy)).await;
    assert_eq!(status, 201);
}

#[tokio::test]
async fn setup_code_is_single_use() {
    let state = server_state();
    let real = code(&state).await;
    assert_eq!(post(&state, server_body(&real)).await.0, 201);
    let (status, json) = post(&state, server_body(&real)).await;
    assert_eq!(status, 403);
    assert_eq!(json["error_code"], "setup_code_invalid");
}

#[tokio::test]
async fn code_required_needs_email_and_password() {
    let state = server_state();
    let real = code(&state).await;
    for extra in [
        json!({"setup_code": real}),
        json!({"setup_code": real, "email": "ada@example.com"}),
        json!({"setup_code": real, "password": "correct horse"}),
    ] {
        let (status, json) = post(&state, body(extra)).await;
        assert_eq!(status, 422);
        assert_eq!(json["error_code"], "validation");
    }
    // The failed attempts did not burn the code.
    assert_eq!(post(&state, server_body(&real)).await.0, 201);
}

#[tokio::test]
async fn several_libraries_on_a_server() {
    let state = server_state();
    for _ in 0..2 {
        let c = code(&state).await;
        assert_eq!(post(&state, server_body(&c)).await.0, 201);
    }
    assert_eq!(count(&state, "libraries").await, 2);
    assert_eq!(count(&state, "users").await, 2);
}

#[tokio::test]
async fn validation_table() {
    let state = AppState::for_tests();
    let cases = [
        json!({"library_name": ""}),
        json!({"library_name": "   "}),
        json!({"library_name": "x".repeat(81)}),
        json!({"email": "ada.example.com"}),
        json!({"password": "1234567"}),
        json!({"device_kind": "tv"}),
    ];
    for extra in cases {
        let (status, json) = post(&state, body(extra.clone())).await;
        assert_eq!(status, 422, "{extra}");
        assert_eq!(json["error_code"], "validation", "{extra}");
    }
    for table in ["libraries", "users", "devices"] {
        assert_eq!(count(&state, table).await, 0);
    }
}

#[tokio::test]
async fn email_is_normalised() {
    let state = AppState::for_tests();
    let (status, json) = post(
        &state,
        body(json!({"email": " Ada@Example.COM ", "password": "correct horse"})),
    )
    .await;
    assert_eq!(status, 201);
    assert_eq!(json["user"]["email"], "ada@example.com");
    let stored: String = state
        .db
        .run(|c| c.query_row("SELECT email FROM users", [], |r| r.get(0)))
        .await
        .expect("email");
    assert_eq!(stored, "ada@example.com");
}

#[tokio::test]
async fn failed_setup_creates_nothing() {
    let state = AppState::for_tests();
    let (status, _) = post(&state, body(json!({"password": "short"}))).await;
    assert_eq!(status, 422);
    for table in ["libraries", "users", "devices"] {
        assert_eq!(count(&state, table).await, 0);
    }
}
