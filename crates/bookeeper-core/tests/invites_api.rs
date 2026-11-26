mod common;

use bookeeper_core::auth::tokens::hash_code;
use bookeeper_core::auth::{Role, Session};
use bookeeper_core::AppState;
use common::{add_user, audit_rows, call, other_library, seed};
use serde_json::{json, Value};

const ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DAY: i64 = 86_400;

fn tok(s: &Session) -> &str {
    &s.access_token
}

async fn invite(state: &AppState, who: &Session, body: Value) -> (u16, Value) {
    let (st, _, b) = call(state, "POST", "/api/v1/invites", Some(tok(who)), Some(body)).await;
    (st, b)
}

async fn inspect(state: &AppState, code: &str) -> (u16, Value) {
    let (st, _, b) = call(
        state,
        "POST",
        "/api/v1/pairing/inspect",
        None,
        Some(json!({ "code": code })),
    )
    .await;
    (st, b)
}

async fn redeem(state: &AppState, code: &str, name: Option<&str>) -> (u16, Value) {
    let mut body = json!({"code": code, "device_name": "Phone", "device_kind": "mobile"});
    if let Some(n) = name {
        body["display_name"] = json!(n);
    }
    let (st, _, b) = call(state, "POST", "/api/v1/pairing/redeem", None, Some(body)).await;
    (st, b)
}

async fn new_invite(state: &AppState, who: &Session, role: &str) -> (String, String) {
    let (st, b) = invite(state, who, json!({ "role": role })).await;
    assert_eq!(st, 201, "{b}");
    (
        b["id"].as_str().unwrap().to_string(),
        b["code"].as_str().unwrap().to_string(),
    )
}

async fn sql(state: &AppState, q: &'static str) {
    state.db.run(move |c| c.execute(q, [])).await.expect("sql");
}

#[tokio::test]
async fn creation_depends_on_who_acts() {
    let s = seed(Role::Owner, None, None).await;
    let admin = add_user(&s.state, &s.library_id, Role::Admin, "Bruno")
        .await
        .1;
    let member = add_user(&s.state, &s.library_id, Role::Member, "Carla")
        .await
        .1;
    let guest = add_user(&s.state, &s.library_id, Role::Guest, "Dino")
        .await
        .1;
    for role in ["admin", "member", "guest"] {
        assert_eq!(
            invite(&s.state, &s.session, json!({ "role": role }))
                .await
                .0,
            201
        );
    }
    for role in ["member", "guest"] {
        assert_eq!(
            invite(&s.state, &admin, json!({ "role": role })).await.0,
            201
        );
    }
    let (st, b) = invite(&s.state, &admin, json!({"role": "admin"})).await;
    assert_eq!((st, b["error_code"].as_str()), (403, Some("forbidden")));
    for who in [&member, &guest] {
        for role in ["member", "guest", "admin"] {
            assert_eq!(invite(&s.state, who, json!({ "role": role })).await.0, 403);
        }
    }
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/invites",
        None,
        Some(json!({"role": "guest"})),
    )
    .await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn created_invite_has_code_id_and_default_expiry() {
    let s = seed(Role::Admin, None, None).await;
    let before = chrono::Utc::now().timestamp();
    let (st, b) = invite(&s.state, &s.session, json!({"role": "member"})).await;
    assert_eq!(st, 201);
    let code = b["code"].as_str().unwrap().to_string();
    assert_eq!(code.len(), 8);
    assert!(code.chars().all(|c| ALPHABET.contains(c)));
    assert_eq!(b["role"], "member");
    assert!((b["expires_at"].as_i64().unwrap() - (before + 7 * DAY)).abs() <= 5);
    let id = b["id"].as_str().unwrap().to_string();
    assert_eq!(uuid::Uuid::parse_str(&id).unwrap().get_version_num(), 7);
    let hash = hash_code(&code);
    let stored: (String, String) = s
        .state
        .db
        .run(move |c| {
            c.query_row(
                "SELECT id, kind FROM pairing_codes WHERE code_hash = ?1",
                [hash],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .await
        .unwrap();
    assert_eq!(stored, (id, "invite".to_string()));
}

#[tokio::test]
async fn custom_expiry_and_range() {
    let s = seed(Role::Owner, None, None).await;
    let before = chrono::Utc::now().timestamp();
    for days in [1, 30] {
        let (st, b) = invite(
            &s.state,
            &s.session,
            json!({"role": "guest", "expires_in_days": days}),
        )
        .await;
        assert_eq!(st, 201);
        assert!((b["expires_at"].as_i64().unwrap() - (before + days * DAY)).abs() <= 5);
    }
    for body in [
        json!({"role": "guest", "expires_in_days": 0}),
        json!({"role": "guest", "expires_in_days": 31}),
        json!({"role": "guest", "expires_in_days": -3}),
        json!({"role": "owner"}),
        json!({"role": "king"}),
        json!({}),
    ] {
        let (st, b) = invite(&s.state, &s.session, body.clone()).await;
        assert_eq!(
            (st, b["error_code"].as_str()),
            (422, Some("validation")),
            "{body}"
        );
    }
}

#[tokio::test]
async fn device_codes_get_an_id_too() {
    let s = seed(Role::Member, None, None).await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!(st, 201);
    let n: i64 = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM pairing_codes WHERE id IS NOT NULL AND kind = 'device'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn list_shows_only_pending_invites_newest_first() {
    let s = seed(Role::Owner, None, None).await;
    let admin = add_user(&s.state, &s.library_id, Role::Admin, "Bruno")
        .await
        .1;
    let member = add_user(&s.state, &s.library_id, Role::Member, "Carla")
        .await
        .1;
    let (a, a_code) = new_invite(&s.state, &s.session, "member").await;
    let (b, _) = new_invite(&s.state, &admin, "guest").await;
    let (c, _) = new_invite(&s.state, &s.session, "admin").await;
    let (used, used_code) = new_invite(&s.state, &s.session, "guest").await;
    let (old, _) = new_invite(&s.state, &s.session, "guest").await;
    assert_eq!(redeem(&s.state, &used_code, Some("Uso")).await.0, 200);
    let old2 = old.clone();
    s.state
        .db
        .run(move |conn| {
            conn.execute(
                "UPDATE pairing_codes SET expires_at = 1 WHERE id = ?1",
                [old2],
            )
        })
        .await
        .unwrap();
    // Distinct creation times: a < b < c.
    for (id, t) in [(&a, 1_000), (&b, 2_000), (&c, 3_000)] {
        let id = id.clone();
        s.state
            .db
            .run(move |conn| {
                conn.execute(
                    "UPDATE pairing_codes SET created_at = ?1 WHERE id = ?2",
                    rusqlite::params![t, id],
                )
            })
            .await
            .unwrap();
    }
    // A device code is not an invite.
    call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&s.session)),
        None,
    )
    .await;

    let (st, _, body) = call(&s.state, "GET", "/api/v1/invites", Some(tok(&admin)), None).await;
    assert_eq!(st, 200);
    let items = body["items"].as_array().unwrap();
    let ids: Vec<&str> = items.iter().map(|i| i["id"].as_str().unwrap()).collect();
    assert_eq!(ids, [c.as_str(), b.as_str(), a.as_str()]);
    assert!(!ids.contains(&used.as_str()) && !ids.contains(&old.as_str()));
    assert_eq!(items[0]["role"], "admin");
    assert_eq!(
        items[1]["created_by"],
        json!({"id": admin_id(&s, "Bruno").await, "display_name": "Bruno"})
    );
    assert!(items.iter().all(|i| i.get("code").is_none()));
    assert!(!body.to_string().contains(&a_code));
    for who in [&member] {
        assert_eq!(
            call(&s.state, "GET", "/api/v1/invites", Some(tok(who)), None)
                .await
                .0,
            403
        );
    }
}

async fn admin_id(s: &common::Seeded, name: &'static str) -> String {
    s.state
        .db
        .run(move |c| {
            c.query_row(
                "SELECT id FROM users WHERE display_name = ?1",
                [name],
                |r| r.get(0),
            )
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn revoking_an_invite() {
    let s = seed(Role::Admin, None, None).await;
    let member = add_user(&s.state, &s.library_id, Role::Member, "Carla")
        .await
        .1;
    let (id, code) = new_invite(&s.state, &s.session, "guest").await;
    let url = format!("/api/v1/invites/{id}");
    assert_eq!(
        call(&s.state, "DELETE", &url, Some(tok(&member)), None)
            .await
            .0,
        403
    );
    assert_eq!(
        call(&s.state, "DELETE", &url, Some(tok(&s.session)), None)
            .await
            .0,
        204
    );
    assert_eq!(
        call(&s.state, "DELETE", &url, Some(tok(&s.session)), None)
            .await
            .0,
        404
    );
    assert_eq!(redeem(&s.state, &code, Some("X")).await.0, 401);
    let (_, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/invites",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert!(body["items"].as_array().unwrap().is_empty());

    // Used, expired, device codes and other libraries: 404.
    let (used, used_code) = new_invite(&s.state, &s.session, "guest").await;
    assert_eq!(redeem(&s.state, &used_code, Some("Uso")).await.0, 200);
    assert_eq!(
        call(
            &s.state,
            "DELETE",
            &format!("/api/v1/invites/{used}"),
            Some(tok(&s.session)),
            None
        )
        .await
        .0,
        404
    );
    let (old, _) = new_invite(&s.state, &s.session, "guest").await;
    let old2 = old.clone();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE pairing_codes SET expires_at = 1 WHERE id = ?1",
                [old2],
            )
        })
        .await
        .unwrap();
    assert_eq!(
        call(
            &s.state,
            "DELETE",
            &format!("/api/v1/invites/{old}"),
            Some(tok(&s.session)),
            None
        )
        .await
        .0,
        404
    );
    call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&s.session)),
        None,
    )
    .await;
    let device_code_id: String = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT id FROM pairing_codes WHERE kind = 'device'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(
        call(
            &s.state,
            "DELETE",
            &format!("/api/v1/invites/{device_code_id}"),
            Some(tok(&s.session)),
            None
        )
        .await
        .0,
        404
    );
    let (_, other) = other_library(&s.state).await;
    let (keep, _) = new_invite(&s.state, &s.session, "guest").await;
    assert_eq!(
        call(
            &s.state,
            "DELETE",
            &format!("/api/v1/invites/{keep}"),
            Some(tok(&other)),
            None
        )
        .await
        .0,
        404
    );
}

#[tokio::test]
async fn inspect_tells_what_a_code_is_without_consuming_it() {
    let s = seed(Role::Owner, None, None).await;
    let (_, code) = new_invite(&s.state, &s.session, "member").await;
    let (st, b) = inspect(&s.state, &code).await;
    assert_eq!(st, 200);
    assert_eq!(b["kind"], "invite");
    assert_eq!(b["library_name"], "Casa");
    assert_eq!(b["role"], "member");
    assert!(b["user_display_name"].is_null());
    assert!(b["expires_at"].as_i64().is_some());
    // Messy input is accepted and nothing is consumed.
    assert_eq!(
        inspect(&s.state, &format!(" {} ", code.to_lowercase()))
            .await
            .0,
        200
    );

    let (st, _, d) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&s.session)),
        None,
    )
    .await;
    assert_eq!(st, 201);
    let dcode = d["code"].as_str().unwrap();
    let (st, b) = inspect(&s.state, dcode).await;
    assert_eq!(st, 200);
    assert_eq!(b["kind"], "device");
    assert_eq!(b["user_display_name"], "Ada");
    assert!(b["role"].is_null());
    assert_eq!(b["library_name"], "Casa");

    // Both can still be redeemed.
    assert_eq!(redeem(&s.state, &code, Some("Nuova")).await.0, 200);
    assert_eq!(redeem(&s.state, dcode, None).await.0, 200);
    // And now they are not valid any more.
    for c in [code.as_str(), dcode] {
        let (st, b) = inspect(&s.state, c).await;
        assert_eq!(
            (st, b["error_code"].as_str()),
            (401, Some("pairing_code_invalid"))
        );
    }
}

#[tokio::test]
async fn inspect_rejects_false_and_expired_codes() {
    let s = seed(Role::Owner, None, None).await;
    let (st, b) = inspect(&s.state, "AAAAAAAA").await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("pairing_code_invalid"))
    );
    let (_, code) = new_invite(&s.state, &s.session, "guest").await;
    sql(&s.state, "UPDATE pairing_codes SET expires_at = 1").await;
    assert_eq!(inspect(&s.state, &code).await.0, 401);
}

#[tokio::test]
async fn redeeming_an_invite_creates_the_person_and_a_session() {
    let s = seed(Role::Owner, None, None).await;
    for role in ["admin", "member", "guest"] {
        let (_, code) = new_invite(&s.state, &s.session, role).await;
        let (st, b) = redeem(&s.state, &code, Some("  Nuova Persona ")).await;
        assert_eq!(st, 200, "{b}");
        assert_eq!(b["user"]["role"], role);
        assert_eq!(b["user"]["display_name"], "Nuova Persona");
        assert!(b["user"]["email"].is_null());
        assert_eq!(b["library"]["id"], s.library_id);
        let user_id = b["user"]["id"].as_str().unwrap().to_string();
        let access = b["session"]["access_token"].as_str().unwrap();
        let (st, _, users) = call(&s.state, "GET", "/api/v1/users", Some(access), None).await;
        assert_eq!(st, 200);
        let me = users["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["is_me"] == true)
            .unwrap()
            .clone();
        assert_eq!(
            (me["id"].as_str().unwrap(), me["role"].as_str().unwrap()),
            (user_id.as_str(), role)
        );
        assert_eq!(me["devices"], 1);
        let (email, hash): (Option<String>, Option<String>) = s
            .state
            .db
            .run(move |c| {
                c.query_row(
                    "SELECT email, password_hash FROM users WHERE id = ?1",
                    [user_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
            })
            .await
            .unwrap();
        assert_eq!((email, hash), (None, None));
    }
}

#[tokio::test]
async fn an_invite_needs_a_display_name_and_is_not_consumed_without_one() {
    let s = seed(Role::Owner, None, None).await;
    let (_, code) = new_invite(&s.state, &s.session, "member").await;
    for name in [None, Some(""), Some("   "), Some("x".repeat(61).as_str())] {
        let (st, b) = redeem(&s.state, &code, name).await;
        assert_eq!(
            (st, b["error_code"].as_str()),
            (422, Some("validation")),
            "{name:?}"
        );
    }
    let users: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(users, 1);
    assert_eq!(redeem(&s.state, &code, Some(&"x".repeat(60))).await.0, 200);
}

#[tokio::test]
async fn a_second_redemption_fails() {
    let s = seed(Role::Owner, None, None).await;
    let (_, code) = new_invite(&s.state, &s.session, "guest").await;
    assert_eq!(redeem(&s.state, &code, Some("Uno")).await.0, 200);
    let (st, b) = redeem(&s.state, &code, Some("Due")).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (401, Some("pairing_code_invalid"))
    );
    let users: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(users, 2);
}

#[tokio::test]
async fn concurrent_redemptions_have_one_winner() {
    let s = seed(Role::Owner, None, None).await;
    let (_, code) = new_invite(&s.state, &s.session, "guest").await;
    let (a, b, c) = tokio::join!(
        redeem(&s.state, &code, Some("Uno")),
        redeem(&s.state, &code, Some("Due")),
        redeem(&s.state, &code, Some("Tre")),
    );
    let mut statuses = [a.0, b.0, c.0];
    statuses.sort();
    assert_eq!(statuses, [200, 401, 401]);
    let users: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(users, 2);
}

#[tokio::test]
async fn a_device_code_ignores_display_name() {
    let s = seed(Role::Member, None, None).await;
    let (_, _, d) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&s.session)),
        None,
    )
    .await;
    let (st, b) = redeem(&s.state, d["code"].as_str().unwrap(), Some("Altro")).await;
    assert_eq!(st, 200);
    assert_eq!(b["user"]["id"], s.user_id);
    assert_eq!(b["user"]["display_name"], "Ada");
}

#[tokio::test]
async fn inspect_and_redeem_share_the_attempt_limit() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..10 {
        let st = if i % 2 == 0 {
            inspect(&s.state, "NOPE2222").await.0
        } else {
            redeem(&s.state, "NOPE2222", Some("X")).await.0
        };
        assert_eq!(st, 401);
    }
    let (st, headers, b) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/inspect",
        None,
        Some(json!({"code": "NOPE2222"})),
    )
    .await;
    assert_eq!((st, b["error_code"].as_str()), (429, Some("rate_limited")));
    assert!(headers.contains_key("retry-after"));
    assert_eq!(redeem(&s.state, "NOPE2222", Some("X")).await.0, 429);

    // And the other way round, with a fresh limiter.
    let s = seed(Role::Owner, None, None).await;
    for _ in 0..10 {
        assert_eq!(redeem(&s.state, "NOPE2222", Some("X")).await.0, 401);
    }
    assert_eq!(inspect(&s.state, "NOPE2222").await.0, 429);
}

#[tokio::test]
async fn a_successful_inspect_does_not_clear_the_failures() {
    let s = seed(Role::Owner, None, None).await;
    let (_, code) = new_invite(&s.state, &s.session, "guest").await;
    for _ in 0..9 {
        assert_eq!(inspect(&s.state, "NOPE2222").await.0, 401);
    }
    assert_eq!(inspect(&s.state, &code).await.0, 200);
    assert_eq!(inspect(&s.state, "NOPE2222").await.0, 401);
    assert_eq!(inspect(&s.state, &code).await.0, 429);
}

#[tokio::test]
async fn invite_actions_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let (id, _) = new_invite(&s.state, &s.session, "guest").await;
    let (id2, code2) = new_invite(&s.state, &s.session, "member").await;
    call(
        &s.state,
        "DELETE",
        &format!("/api/v1/invites/{id}"),
        Some(tok(&s.session)),
        None,
    )
    .await;
    let (_, b) = redeem(&s.state, &code2, Some("Nuova")).await;
    let new_user = b["user"]["id"].as_str().unwrap().to_string();
    let rows = audit_rows(&s.state, &s.library_id).await;
    assert_eq!(
        rows,
        vec![
            ("invite.create".into(), "invite".into(), id.clone()),
            ("invite.create".into(), "invite".into(), id2),
            ("invite.revoke".into(), "invite".into(), id),
            ("user.join".into(), "user".into(), new_user.clone()),
        ]
    );
    let actor: String = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT user_id FROM audit_log WHERE action = 'user.join'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(actor, new_user);
}
