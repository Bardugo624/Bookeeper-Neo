mod common;

use axum::body::Body;
use axum::http::Request;
use axum::routing::get;
use bookeeper_core::api::confirm::Confirmed;
use bookeeper_core::auth::tokens::{issue_confirm, verify_access, CONFIRM_TTL_SECS};
use bookeeper_core::auth::{Identity, Role};
use bookeeper_core::AppState;
use common::{add_user, call, seed};
use serde_json::{json, Value};
use tower::ServiceExt;

const PW: &str = "correct horse";

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

async fn confirm(state: &AppState, bearer: &str, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        state,
        "POST",
        "/api/v1/auth/confirm",
        Some(bearer),
        Some(body),
    )
    .await;
    (st, b)
}

async fn protected(Confirmed(u): Confirmed) -> String {
    u.user_id
}

/// Calls a probe route behind `Confirmed`.
async fn probe(state: &AppState, bearer: &str, confirm: Option<&str>) -> (u16, Value) {
    let app = axum::Router::new()
        .route("/probe", get(protected))
        .with_state(state.clone());
    let mut req = Request::builder()
        .uri("/probe")
        .header("authorization", format!("Bearer {bearer}"));
    if let Some(c) = confirm {
        req = req.header("x-confirm-token", c);
    }
    let resp = app
        .oneshot(req.body(Body::empty()).expect("request"))
        .await
        .expect("response");
    let status = resp.status().as_u16();
    let bytes = http_body_util::BodyExt::collect(resp.into_body())
        .await
        .expect("body")
        .to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn identity(lib: &str, user: &str, device: &str) -> Identity {
    Identity {
        library_id: lib.into(),
        user_id: user.into(),
        device_id: device.into(),
        role: Role::Owner,
    }
}

#[tokio::test]
async fn confirm_with_the_right_password() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (st, b) = confirm(&s.state, &s.session.access_token, json!({"password": PW})).await;
    assert_eq!(st, 200);
    assert_eq!(b["expires_in"], 300);
    assert!(b["confirm_token"].as_str().is_some_and(|t| !t.is_empty()));
}

#[tokio::test]
async fn confirm_with_the_wrong_password_is_invalid_credentials() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (st, b) = confirm(
        &s.state,
        &s.session.access_token,
        json!({"password": "nope nope"}),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "invalid_credentials");
}

#[tokio::test]
async fn confirm_without_password_when_one_is_set_is_validation() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (st, b) = confirm(&s.state, &s.session.access_token, json!({})).await;
    assert_eq!(st, 422);
    assert_eq!(b["error_code"], "validation");
}

#[tokio::test]
async fn confirm_without_password_when_none_is_set_succeeds() {
    let s = seed(Role::Owner, None, None).await;
    let (st, b) = confirm(&s.state, &s.session.access_token, json!({})).await;
    assert_eq!(st, 200);
    assert_eq!(b["expires_in"], 300);
    assert!(b["confirm_token"].is_string());
}

#[tokio::test]
async fn wrong_confirmations_are_rate_limited() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    for _ in 0..5 {
        let (st, _) = confirm(
            &s.state,
            &s.session.access_token,
            json!({"password": "wrong one"}),
        )
        .await;
        assert_eq!(st, 401);
    }
    let (st, _) = confirm(&s.state, &s.session.access_token, json!({"password": PW})).await;
    assert_eq!(st, 429);
}

#[tokio::test]
async fn confirm_token_is_not_an_access_token() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (_, b) = confirm(&s.state, &s.session.access_token, json!({"password": PW})).await;
    let token = b["confirm_token"].as_str().expect("token");
    let (st, _, _) = call(&s.state, "GET", "/api/v1/me", Some(token), None).await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn access_token_is_not_a_confirm_token() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let a = &s.session.access_token;
    let (st, b) = probe(&s.state, a, Some(a)).await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "confirmation_required");
}

#[tokio::test]
async fn legacy_access_token_without_kind_still_works() {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let secret = b"test-secret";
    let t = now();
    let claims =
        json!({"lid": "l", "uid": "u", "did": "d", "role": "owner", "iat": t, "exp": t + 900});
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .expect("encode");
    let got = verify_access(secret, &token, t).expect("legacy token accepted");
    assert_eq!(got.uid, "u");
}

#[tokio::test]
async fn confirmed_extractor_accepts_a_fresh_token() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (_, b) = confirm(&s.state, &s.session.access_token, json!({"password": PW})).await;
    let token = b["confirm_token"].as_str().expect("token");
    let (st, _) = probe(&s.state, &s.session.access_token, Some(token)).await;
    assert_eq!(st, 200);
    // Not single-use.
    let (st, _) = probe(&s.state, &s.session.access_token, Some(token)).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn confirmed_extractor_rejects_missing_expired_and_foreign_tokens() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let a = &s.session.access_token;
    let secret = s.state.jwt_secret.clone();
    let me = bookeeper_core::auth::tokens::verify_access(&secret, a, now()).expect("claims");

    let (st, b) = probe(&s.state, a, None).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("confirmation_required"))
    );

    let old = issue_confirm(
        &secret,
        &identity(&me.lid, &me.uid, &me.did),
        now() - CONFIRM_TTL_SECS - 1,
    );
    let (st, b) = probe(&s.state, a, Some(&old)).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("confirmation_required"))
    );

    let (other_uid, _) = add_user(&s.state, &s.library_id, Role::Member, "Bea").await;
    let foreign = issue_confirm(&secret, &identity(&me.lid, &other_uid, &me.did), now());
    let (st, b) = probe(&s.state, a, Some(&foreign)).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("confirmation_required"))
    );

    let other_device = issue_confirm(
        &secret,
        &identity(&me.lid, &me.uid, "another-device"),
        now(),
    );
    let (st, b) = probe(&s.state, a, Some(&other_device)).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("confirmation_required"))
    );

    // Sanity: a token for the right identity, issued now, passes.
    let good = issue_confirm(&secret, &identity(&me.lid, &me.uid, &me.did), now());
    let (st, _) = probe(&s.state, a, Some(&good)).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn confirm_needs_a_token() {
    let s = seed(Role::Owner, Some("a@x.it"), Some(PW)).await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/auth/confirm",
        None,
        Some(json!({"password": PW})),
    )
    .await;
    assert_eq!(st, 401);
}
