use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::get,
    Json, Router,
};
use bookeeper_core::auth::guard::AuthUser;
use bookeeper_core::auth::tokens::issue_access;
use bookeeper_core::auth::{Identity, Role};
use bookeeper_core::{ApiResult, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const LIB: &str = "lib-1";
const USR: &str = "usr-1";
const DEV: &str = "dev-1";

async fn whoami(u: AuthUser) -> Json<Value> {
    Json(json!({
        "library_id": u.library_id, "user_id": u.user_id,
        "device_id": u.device_id, "role": u.role.as_str(),
    }))
}

async fn admin(u: AuthUser) -> ApiResult<Json<Value>> {
    u.require(Role::Admin)?;
    Ok(Json(json!({"ok": true})))
}

fn app(state: &AppState) -> Router {
    Router::new()
        .route("/whoami", get(whoami))
        .route("/admin", get(admin))
        .with_state(state.clone())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

async fn seed(state: &AppState, role: Role, last_seen: Option<i64>, revoked_at: Option<i64>) {
    let role = role.as_str();
    state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'L', 0)",
                [LIB],
            )?;
            c.execute(
                "INSERT INTO users (id, library_id, display_name, role, created_at) \
                 VALUES (?1, ?2, 'U', ?3, 0)",
                rusqlite::params![USR, LIB, role],
            )?;
            c.execute(
                "INSERT INTO devices (id, library_id, user_id, name, kind, refresh_hash, \
                 paired_at, last_seen, revoked_at) \
                 VALUES (?1, ?2, ?3, 'D', 'desktop', 'h', 0, ?4, ?5)",
                rusqlite::params![DEV, LIB, USR, last_seen, revoked_at],
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

fn token(state: &AppState, role: Role, at: i64) -> String {
    let who = Identity {
        library_id: LIB.into(),
        user_id: USR.into(),
        device_id: DEV.into(),
        role,
    };
    issue_access(&state.jwt_secret, &who, at)
}

async fn call(state: &AppState, path: &str, auth: Option<&str>) -> (StatusCode, Value) {
    let mut req = Request::builder().uri(path);
    if let Some(a) = auth {
        req = req.header("authorization", a);
    }
    let res = app(state)
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    assert_eq!(
        res.headers()["content-type"],
        "application/json",
        "content-type"
    );
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

fn bearer(t: &str) -> String {
    format!("Bearer {t}")
}

async fn expect_err(state: &AppState, auth: Option<&str>, code: &str) {
    let (status, body) = call(state, "/whoami", auth).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error_code"], code);
}

async fn last_seen(state: &AppState) -> Option<i64> {
    state
        .db
        .run(|c| {
            c.query_row("SELECT last_seen FROM devices WHERE id = ?1", [DEV], |r| {
                r.get(0)
            })
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn valid_token_passes() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    let t = token(&s, Role::Member, now());
    let (status, body) = call(&s, "/whoami", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({"library_id": LIB, "user_id": USR, "device_id": DEV, "role": "member"})
    );
}

#[tokio::test]
async fn missing_header_is_unauthorized() {
    let s = AppState::for_tests();
    expect_err(&s, None, "unauthorized").await;
}

#[tokio::test]
async fn basic_scheme_is_unauthorized() {
    let s = AppState::for_tests();
    expect_err(&s, Some("Basic abc"), "unauthorized").await;
}

#[tokio::test]
async fn garbage_token_is_unauthorized() {
    let s = AppState::for_tests();
    expect_err(&s, Some("Bearer not.a.jwt"), "unauthorized").await;
}

#[tokio::test]
async fn expired_token_is_token_expired() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    let t = token(&s, Role::Member, now() - 7200);
    expect_err(&s, Some(&bearer(&t)), "token_expired").await;
}

#[tokio::test]
async fn token_of_another_database_is_unauthorized() {
    let s = AppState::for_tests();
    let other = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    let t = token(&other, Role::Member, now());
    expect_err(&s, Some(&bearer(&t)), "unauthorized").await;
}

#[tokio::test]
async fn revoked_device_is_device_revoked() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, Some(5)).await;
    let t = token(&s, Role::Member, now());
    expect_err(&s, Some(&bearer(&t)), "device_revoked").await;
}

#[tokio::test]
async fn deleted_device_is_unauthorized() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    s.db.run(|c| c.execute("DELETE FROM devices", []))
        .await
        .unwrap();
    let t = token(&s, Role::Member, now());
    expect_err(&s, Some(&bearer(&t)), "unauthorized").await;
}

#[tokio::test]
async fn role_comes_from_the_database() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    let t = token(&s, Role::Member, now());
    s.db.run(|c| c.execute("UPDATE users SET role = 'admin'", []))
        .await
        .unwrap();
    let (status, body) = call(&s, "/whoami", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["role"], "admin");
    let (status, _) = call(&s, "/admin", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn require_rejects_lower_roles() {
    let s = AppState::for_tests();
    seed(&s, Role::Member, None, None).await;
    let t = token(&s, Role::Member, now());
    let (status, body) = call(&s, "/admin", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["error_code"], "forbidden");
}

#[tokio::test]
async fn last_seen_is_updated_at_most_once_a_minute() {
    let s = AppState::for_tests();
    let recent = now() - 10;
    seed(&s, Role::Member, Some(recent), None).await;
    let t = token(&s, Role::Member, now());
    let (status, _) = call(&s, "/whoami", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(last_seen(&s).await, Some(recent));

    let old = now() - 120;
    s.db.run(move |c| c.execute("UPDATE devices SET last_seen = ?1", [old]))
        .await
        .unwrap();
    let (status, _) = call(&s, "/whoami", Some(&bearer(&t))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(last_seen(&s).await.unwrap() >= now() - 5);
}
