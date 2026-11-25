mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn get_as(s: &Seeded, token: &str, path: &str) -> (u16, Value) {
    let (st, _, b) = call(&s.state, "GET", path, Some(token), None).await;
    (st, b)
}

async fn get(s: &Seeded, path: &str) -> (u16, Value) {
    get_as(s, &s.session.access_token.clone(), path).await
}

#[allow(clippy::too_many_arguments)]
async fn put_row(
    s: &Seeded,
    lib: &str,
    user: Option<&str>,
    device: Option<&str>,
    action: &str,
    entity: &str,
    detail: Option<&str>,
    at: i64,
) {
    let (lib, user, device, action, entity, detail) = (
        lib.to_string(),
        user.map(str::to_string),
        device.map(str::to_string),
        action.to_string(),
        entity.to_string(),
        detail.map(str::to_string),
    );
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO audit_log (library_id, user_id, device_id, action, entity_type, \
                 entity_id, detail_json, ip, at) VALUES (?1,?2,?3,?4,?5,'e1',?6,'10.0.0.1',?7)",
                rusqlite::params![lib, user, device, action, entity, detail, at],
            )
        })
        .await
        .unwrap();
}

async fn device_id(s: &Seeded, user: &str) -> String {
    let u = user.to_string();
    s.state
        .db
        .run(move |c| {
            c.query_row("SELECT id FROM devices WHERE user_id = ?1", [u], |r| {
                r.get::<_, String>(0)
            })
        })
        .await
        .unwrap()
}

fn actions(b: &Value) -> Vec<&str> {
    b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["action"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn lists_newest_first_with_user_device_and_detail() {
    let s = seed(Role::Owner, None, None).await;
    let dev = device_id(&s, &s.user_id).await;
    put_row(
        &s,
        &s.library_id,
        Some(&s.user_id),
        Some(&dev),
        "a.old",
        "book",
        Some(r#"{"k":1}"#),
        100,
    )
    .await;
    put_row(
        &s,
        &s.library_id,
        Some(&s.user_id),
        Some(&dev),
        "a.new",
        "book",
        None,
        200,
    )
    .await;
    let (st, b) = get(&s, "/api/v1/audit").await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["total"], 2);
    assert_eq!(actions(&b), ["a.new", "a.old"]);
    let it = &b["items"][1];
    assert_eq!(it["user"], json!({"id": s.user_id, "display_name": "Ada"}));
    assert_eq!(it["device"], json!({"id": dev, "name": "Desktop"}));
    assert_eq!(it["detail"], json!({"k": 1}));
    assert_eq!(it["entity_id"], "e1");
    assert!(b["items"][0]["detail"].is_null());
}

#[tokio::test]
async fn ip_is_never_exposed() {
    let s = seed(Role::Owner, None, None).await;
    put_row(
        &s,
        &s.library_id,
        None,
        None,
        "x",
        "book",
        Some(r#"{"ip":"1.2.3.4","n":{"ip":"5.6.7.8","ok":true}}"#),
        1,
    )
    .await;
    let (_, b) = get(&s, "/api/v1/audit").await;
    let it = &b["items"][0];
    assert!(it.get("ip").is_none());
    assert_eq!(it["detail"], json!({"n": {"ok": true}}));
    assert!(!b.to_string().contains("1.2.3.4"));
}

#[tokio::test]
async fn invalid_detail_json_is_null() {
    let s = seed(Role::Owner, None, None).await;
    put_row(
        &s,
        &s.library_id,
        None,
        None,
        "x",
        "book",
        Some("not json {"),
        1,
    )
    .await;
    let (_, b) = get(&s, "/api/v1/audit").await;
    assert!(b["items"][0]["detail"].is_null());
}

#[tokio::test]
async fn filters_combine_in_and() {
    let s = seed(Role::Owner, None, None).await;
    let (bob, bob_s) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let bob_dev = device_id(&s, &bob).await;
    let ada_dev = device_id(&s, &s.user_id).await;
    let l = s.library_id.clone();
    put_row(
        &s,
        &l,
        Some(&s.user_id),
        Some(&ada_dev),
        "book.create",
        "book",
        None,
        10,
    )
    .await;
    put_row(
        &s,
        &l,
        Some(&bob),
        Some(&bob_dev),
        "book.create",
        "book",
        None,
        20,
    )
    .await;
    put_row(
        &s,
        &l,
        Some(&bob),
        Some(&bob_dev),
        "loan.create",
        "loan",
        None,
        30,
    )
    .await;
    let _ = bob_s;
    let n = |b: &Value| b["total"].as_i64().unwrap();
    let cases = [
        (format!("user_id={bob}"), 2),
        (format!("device_id={ada_dev}"), 1),
        ("action=book.create".to_string(), 2),
        ("entity_type=loan".to_string(), 1),
        (format!("user_id={bob}&action=book.create"), 1),
        (format!("user_id={}&entity_type=loan", s.user_id), 0),
    ];
    for (q, want) in cases {
        let (st, b) = get(&s, &format!("/api/v1/audit?{q}")).await;
        assert_eq!(st, 200);
        assert_eq!(n(&b), want, "{q}");
        assert_eq!(b["items"].as_array().unwrap().len() as i64, want, "{q}");
    }
}

#[tokio::test]
async fn date_range_is_inclusive() {
    let s = seed(Role::Owner, None, None).await;
    for (i, at) in [10, 20, 30, 40].into_iter().enumerate() {
        put_row(
            &s,
            &s.library_id,
            None,
            None,
            &format!("a{i}"),
            "book",
            None,
            at,
        )
        .await;
    }
    let (_, b) = get(&s, "/api/v1/audit?from=20&to=30").await;
    assert_eq!(actions(&b), ["a2", "a1"]);
    let (_, b) = get(&s, "/api/v1/audit?from=31").await;
    assert_eq!(actions(&b), ["a3"]);
    let (_, b) = get(&s, "/api/v1/audit?to=10").await;
    assert_eq!(actions(&b), ["a0"]);
}

#[tokio::test]
async fn pagination_and_limits() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..5 {
        put_row(
            &s,
            &s.library_id,
            None,
            None,
            &format!("a{i}"),
            "book",
            None,
            i,
        )
        .await;
    }
    let (_, b) = get(&s, "/api/v1/audit?limit=2&offset=1").await;
    assert_eq!(b["total"], 5);
    assert_eq!(actions(&b), ["a3", "a2"]);
    let (_, b) = get(&s, "/api/v1/audit").await;
    assert_eq!(b["items"].as_array().unwrap().len(), 5);
    let (st, b) = get(&s, "/api/v1/audit?limit=201").await;
    assert_eq!(st, 422, "{b}");
    assert_eq!(get(&s, "/api/v1/audit?limit=200").await.0, 200);
    assert_eq!(get(&s, "/api/v1/audit?limit=0").await.0, 422);
}

#[tokio::test]
async fn only_owner_and_admin_can_read() {
    let s = seed(Role::Owner, None, None).await;
    for (role, want) in [(Role::Admin, 200), (Role::Member, 403), (Role::Guest, 403)] {
        let (_, sess) = add_user(&s.state, &s.library_id, role, "X").await;
        for path in ["/api/v1/audit", "/api/v1/audit/actions"] {
            let (st, b) = get_as(&s, &sess.access_token, path).await;
            assert_eq!(st, want, "{role:?} {path}");
            if want == 403 {
                assert_eq!(b["error_code"], "forbidden", "{b}");
            }
        }
    }
    let (st, _, _) = call(&s.state, "GET", "/api/v1/audit", None, None).await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn deleted_user_and_device_become_null() {
    let s = seed(Role::Owner, None, None).await;
    let (bob, _) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let dev = device_id(&s, &bob).await;
    put_row(
        &s,
        &s.library_id,
        Some(&bob),
        Some(&dev),
        "x",
        "book",
        None,
        1,
    )
    .await;
    let b2 = bob.clone();
    s.state
        .db
        .run(move |c| {
            c.execute("DELETE FROM devices WHERE user_id = ?1", [&b2])?;
            c.execute("DELETE FROM users WHERE id = ?1", [&b2])
        })
        .await
        .unwrap();
    let (st, b) = get(&s, "/api/v1/audit").await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["total"], 1);
    assert!(b["items"][0]["user"].is_null());
    assert!(b["items"][0]["device"].is_null());
}

#[tokio::test]
async fn reading_does_not_write_entries() {
    let s = seed(Role::Owner, None, None).await;
    put_row(&s, &s.library_id, None, None, "x", "book", None, 1).await;
    let before = audit_rows(&s.state, &s.library_id).await;
    get(&s, "/api/v1/audit").await;
    get(&s, "/api/v1/audit?action=x").await;
    get(&s, "/api/v1/audit/actions").await;
    assert_eq!(audit_rows(&s.state, &s.library_id).await, before);
}

#[tokio::test]
async fn libraries_are_isolated() {
    let s = seed(Role::Owner, None, None).await;
    let (other_lib, other) = other_library(&s.state).await;
    put_row(&s, &s.library_id, None, None, "mine", "book", None, 1).await;
    put_row(&s, &other_lib, None, None, "theirs", "book", None, 2).await;
    let (_, b) = get(&s, "/api/v1/audit").await;
    assert_eq!(actions(&b), ["mine"]);
    let (_, b) = get_as(&s, &other.access_token, "/api/v1/audit").await;
    assert_eq!(actions(&b), ["theirs"]);
    let (_, b) = get(&s, "/api/v1/audit/actions").await;
    assert_eq!(b["items"], json!(["mine"]));
}

#[tokio::test]
async fn actions_are_distinct_and_sorted() {
    let s = seed(Role::Owner, None, None).await;
    for (a, at) in [("b.x", 1), ("a.y", 2), ("b.x", 3)] {
        put_row(&s, &s.library_id, None, None, a, "book", None, at).await;
    }
    let (st, b) = get(&s, "/api/v1/audit/actions").await;
    assert_eq!(st, 200);
    assert_eq!(b["items"], json!(["a.y", "b.x"]));
}
