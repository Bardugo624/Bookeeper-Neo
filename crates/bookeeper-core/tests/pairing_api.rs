mod common;

use bookeeper_core::auth::tokens::{hash_code, verify_access};
use bookeeper_core::auth::Role;
use bookeeper_core::AppState;
use common::{call, seed};
use serde_json::{json, Value};

const ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async fn new_code(state: &AppState, token: &str) -> String {
    let (st, _, body) = call(state, "POST", "/api/v1/pairing/codes", Some(token), None).await;
    assert_eq!(st, 201);
    body["code"].as_str().expect("code").to_string()
}

fn redeem_body(code: &str) -> Value {
    json!({"code": code, "device_name": "Phone", "device_kind": "mobile"})
}

async fn redeem(state: &AppState, body: Value) -> (u16, Value) {
    let (st, _, b) = call(state, "POST", "/api/v1/pairing/redeem", None, Some(body)).await;
    (st, b)
}

#[tokio::test]
async fn member_creates_a_code() {
    let s = seed(Role::Member, None, None).await;
    let before = chrono::Utc::now().timestamp();
    let (st, _, body) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 201);
    let code = body["code"].as_str().expect("code").to_string();
    assert_eq!(code.len(), 8);
    assert!(code.chars().all(|c| ALPHABET.contains(c)));
    let exp = body["expires_at"].as_i64().expect("expires_at");
    assert!((exp - (before + 600)).abs() <= 5);

    let stored: Vec<String> = s
        .state
        .db
        .run(|c| {
            let mut stmt = c.prepare("SELECT code_hash FROM pairing_codes")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<Vec<String>>>()
        })
        .await
        .expect("rows");
    assert_eq!(stored, vec![hash_code(&code)]);
}

#[tokio::test]
async fn guest_cannot_create_a_code() {
    let s = seed(Role::Guest, None, None).await;
    let (st, _, body) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 403);
    assert_eq!(body["error_code"], "forbidden");
}

#[tokio::test]
async fn creating_a_code_needs_a_token() {
    let s = seed(Role::Member, None, None).await;
    let (st, _, body) = call(&s.state, "POST", "/api/v1/pairing/codes", None, None).await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "unauthorized");
}

#[tokio::test]
async fn redeem_pairs_a_new_device_for_the_same_user() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    let (st, body) = redeem(&s.state, redeem_body(&code)).await;
    assert_eq!(st, 200);
    assert_eq!(body["user"]["id"], s.user_id);
    assert_eq!(body["user"]["role"], "member");
    assert_eq!(body["library"]["id"], s.library_id);
    let new_device = body["session"]["device_id"].as_str().expect("device");
    assert_ne!(new_device, s.session.device_id);
    let kind: String = {
        let id = new_device.to_string();
        s.state
            .db
            .run(move |c| c.query_row("SELECT kind FROM devices WHERE id = ?1", [id], |r| r.get(0)))
            .await
            .expect("kind")
    };
    assert_eq!(kind, "mobile");
    let token = body["session"]["access_token"].as_str().expect("token");
    let claims = verify_access(&s.state.jwt_secret, token, chrono::Utc::now().timestamp())
        .expect("valid token");
    assert_eq!(claims.uid, s.user_id);
}

#[tokio::test]
async fn redeem_ignores_case_spaces_and_dashes() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    let messy = format!(" {}-{} ", code[..4].to_lowercase(), &code[4..]);
    let (st, _) = redeem(&s.state, redeem_body(&messy)).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn code_is_single_use() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    assert_eq!(redeem(&s.state, redeem_body(&code)).await.0, 200);
    let (st, body) = redeem(&s.state, redeem_body(&code)).await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "pairing_code_invalid");
}

#[tokio::test]
async fn expired_code_is_invalid() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    s.state
        .db
        .run(|c| c.execute("UPDATE pairing_codes SET expires_at = 1", []))
        .await
        .expect("expire");
    let (st, body) = redeem(&s.state, redeem_body(&code)).await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "pairing_code_invalid");
}

#[tokio::test]
async fn wrong_code_is_invalid() {
    let s = seed(Role::Member, None, None).await;
    let _ = new_code(&s.state, &s.session.access_token).await;
    let (st, body) = redeem(&s.state, redeem_body("AAAAAAAA")).await;
    assert_eq!(st, 401);
    assert_eq!(body["error_code"], "pairing_code_invalid");
}

#[tokio::test]
async fn invalid_device_kind_does_not_burn_the_code() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    let (st, _) = redeem(
        &s.state,
        json!({"code": code, "device_name": "Phone", "device_kind": "toaster"}),
    )
    .await;
    assert_eq!(st, 422);
    let (st, _) = redeem(
        &s.state,
        json!({"code": code, "device_name": "  ", "device_kind": "mobile"}),
    )
    .await;
    assert_eq!(st, 422);
    assert_eq!(redeem(&s.state, redeem_body(&code)).await.0, 200);
}

#[tokio::test]
async fn expired_codes_are_purged_on_create() {
    let s = seed(Role::Member, None, None).await;
    let (lib, uid) = (s.library_id.clone(), s.user_id.clone());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO pairing_codes (code_hash, library_id, kind, user_id, role, created_by, expires_at, created_at)
                 VALUES ('stale', ?1, 'device', ?2, NULL, ?2, 1, 1)",
                [lib, uid],
            )
        })
        .await
        .expect("insert");
    let _ = new_code(&s.state, &s.session.access_token).await;
    let stale: i64 = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM pairing_codes WHERE code_hash = 'stale'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .expect("count");
    assert_eq!(stale, 0);
}

#[tokio::test]
async fn concurrent_redeem_one_wins() {
    let s = seed(Role::Member, None, None).await;
    let code = new_code(&s.state, &s.session.access_token).await;
    let (a, b) = tokio::join!(
        redeem(&s.state, redeem_body(&code)),
        redeem(&s.state, redeem_body(&code))
    );
    let mut statuses = [a.0, b.0];
    statuses.sort_unstable();
    assert_eq!(statuses, [200, 401]);
}
