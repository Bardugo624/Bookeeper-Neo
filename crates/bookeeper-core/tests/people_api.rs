mod common;

use bookeeper_core::auth::{Role, Session};
use bookeeper_core::AppState;
use common::{add_user, audit_rows, call, insert_book, other_library, seed};
use serde_json::{json, Value};

async fn sql(state: &AppState, q: &'static str, args: Vec<String>) {
    state
        .db
        .run(move |c| c.execute(q, rusqlite::params_from_iter(args)))
        .await
        .expect("sql");
}

async fn count(state: &AppState, q: &'static str, arg: &str) -> i64 {
    let arg = arg.to_string();
    state
        .db
        .run(move |c| c.query_row(q, [arg], |r| r.get(0)))
        .await
        .expect("count")
}

async fn role_of(state: &AppState, id: &str) -> String {
    let id = id.to_string();
    state
        .db
        .run(move |c| c.query_row("SELECT role FROM users WHERE id = ?1", [id], |r| r.get(0)))
        .await
        .expect("role")
}

fn tok(s: &Session) -> &str {
    &s.access_token
}

async fn patch(s: &AppState, who: &Session, id: &str, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        s,
        "PATCH",
        &format!("/api/v1/users/{id}"),
        Some(tok(who)),
        Some(body),
    )
    .await;
    (st, b)
}

async fn delete(s: &AppState, who: &Session, id: &str) -> u16 {
    call(
        s,
        "DELETE",
        &format!("/api/v1/users/{id}"),
        Some(tok(who)),
        None,
    )
    .await
    .0
}

/// Owner Ada (own session in `Seeded`), plus admin, member and guest.
struct Family {
    s: common::Seeded,
    admin: (String, Session),
    member: (String, Session),
    guest: (String, Session),
}

async fn family() -> Family {
    let s = seed(Role::Owner, Some("ada@example.org"), None).await;
    let admin = add_user(&s.state, &s.library_id, Role::Admin, "Bruno").await;
    let member = add_user(&s.state, &s.library_id, Role::Member, "Carla").await;
    let guest = add_user(&s.state, &s.library_id, Role::Guest, "Dino").await;
    Family {
        s,
        admin,
        member,
        guest,
    }
}

#[tokio::test]
async fn list_orders_by_role_then_name_and_shows_me() {
    let f = family().await;
    add_user(&f.s.state, &f.s.library_id, Role::Member, "alfa").await;
    add_user(&f.s.state, &f.s.library_id, Role::Member, "Zeta").await;
    add_user(&f.s.state, &f.s.library_id, Role::Guest, "ugo").await;
    let (st, _, body) = call(
        &f.s.state,
        "GET",
        "/api/v1/users",
        Some(tok(&f.member.1)),
        None,
    )
    .await;
    assert_eq!(st, 200);
    let names: Vec<&str> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["display_name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        ["Ada", "Bruno", "alfa", "Carla", "Zeta", "Dino", "ugo"]
    );
    let me: Vec<&Value> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["is_me"] == true)
        .collect();
    assert_eq!(me.len(), 1);
    assert_eq!(me[0]["id"], f.member.0);
    assert_eq!(me[0]["devices"], 1);
    assert!(me[0]["created_at"].as_i64().is_some());
    assert!(me[0]["last_seen"].as_i64().is_some());
}

#[tokio::test]
async fn email_only_for_admin_and_owner() {
    let f = family().await;
    sql(
        &f.s.state,
        "UPDATE users SET email = 'carla@example.org' WHERE id = ?1",
        vec![f.member.0.clone()],
    )
    .await;
    for (who, sees) in [
        (&f.s.session, true),
        (&f.admin.1, true),
        (&f.member.1, false),
        (&f.guest.1, false),
    ] {
        let (_, _, body) = call(&f.s.state, "GET", "/api/v1/users", Some(tok(who)), None).await;
        for p in body["items"].as_array().unwrap() {
            let has = p.get("email").is_some();
            match p["display_name"].as_str().unwrap() {
                "Ada" | "Carla" => assert_eq!(has, sees, "{p}"),
                _ => assert!(!has, "{p}"),
            }
        }
    }
    // Also in the PATCH response.
    let (_, b) = patch(&f.s.state, &f.admin.1, &f.member.0, json!({})).await;
    assert_eq!(b["email"], "carla@example.org");
}

#[tokio::test]
async fn devices_count_skips_revoked_and_last_seen_is_the_latest() {
    let f = family().await;
    sql(
        &f.s.state,
        "UPDATE devices SET last_seen = 100 WHERE user_id = ?1",
        vec![f.guest.0.clone()],
    )
    .await;
    sql(
        &f.s.state,
        "INSERT INTO devices (id, library_id, user_id, name, kind, refresh_hash, paired_at, last_seen)
         VALUES ('d2', ?1, ?2, 'Tablet', 'mobile', 'h2', 1, 500)",
        vec![f.s.library_id.clone(), f.guest.0.clone()],
    )
    .await;
    sql(
        &f.s.state,
        "INSERT INTO devices (id, library_id, user_id, name, kind, refresh_hash, paired_at, last_seen, revoked_at)
         VALUES ('d3', ?1, ?2, 'Old', 'mobile', 'h3', 1, 900, 901)",
        vec![f.s.library_id.clone(), f.guest.0.clone()],
    )
    .await;
    let (_, _, body) = call(
        &f.s.state,
        "GET",
        "/api/v1/users",
        Some(tok(&f.s.session)),
        None,
    )
    .await;
    let me = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == f.guest.0.as_str())
        .unwrap();
    assert_eq!(me["devices"], 2);
    assert_eq!(me["last_seen"], 500);
}

#[tokio::test]
async fn owner_manages_everyone_but_themselves() {
    let f = family().await;
    let s = &f.s.state;
    let (st, b) = patch(s, &f.s.session, &f.admin.0, json!({"role": "guest"})).await;
    assert_eq!((st, b["role"].as_str()), (200, Some("guest")));
    let (st, b) = patch(
        s,
        &f.s.session,
        &f.guest.0,
        json!({"role": "admin", "display_name": "  Dina "}),
    )
    .await;
    assert_eq!(
        (st, b["role"].as_str(), b["display_name"].as_str()),
        (200, Some("admin"), Some("Dina"))
    );
    let (st, _) = patch(s, &f.s.session, &f.s.user_id, json!({"role": "admin"})).await;
    assert_eq!(st, 403);
    // The owner renames themselves.
    let (st, b) = patch(
        s,
        &f.s.session,
        &f.s.user_id,
        json!({"display_name": "Ada L."}),
    )
    .await;
    assert_eq!((st, b["display_name"].as_str()), (200, Some("Ada L.")));
    assert_eq!(delete(s, &f.s.session, &f.s.user_id).await, 403);
}

#[tokio::test]
async fn admin_manages_members_and_guests_only() {
    let f = family().await;
    let s = &f.s.state;
    let a = &f.admin.1;
    let (st, b) = patch(s, a, &f.member.0, json!({"role": "guest"})).await;
    assert_eq!((st, b["role"].as_str()), (200, Some("guest")));
    let (st, b) = patch(
        s,
        a,
        &f.member.0,
        json!({"role": "member", "display_name": "Carlo"}),
    )
    .await;
    assert_eq!((st, b["display_name"].as_str()), (200, Some("Carlo")));
    // Cannot assign admin.
    assert_eq!(
        patch(s, a, &f.member.0, json!({"role": "admin"})).await.0,
        403
    );
    // Cannot touch the owner, or another admin.
    let other_admin = add_user(s, &f.s.library_id, Role::Admin, "Elsa").await;
    for target in [&f.s.user_id, &other_admin.0] {
        assert_eq!(
            patch(s, a, target, json!({"display_name": "X"})).await.0,
            403
        );
        assert_eq!(patch(s, a, target, json!({"role": "member"})).await.0, 403);
        assert_eq!(delete(s, a, target).await, 403);
    }
    // Own role is not theirs to change, own name is.
    assert_eq!(
        patch(s, a, &f.admin.0, json!({"role": "member"})).await.0,
        403
    );
    assert_eq!(
        patch(s, a, &f.admin.0, json!({"display_name": "Bru"}))
            .await
            .0,
        200
    );
}

#[tokio::test]
async fn members_and_guests_manage_nobody() {
    let f = family().await;
    let s = &f.s.state;
    for who in [&f.member.1, &f.guest.1] {
        assert_eq!(
            patch(s, who, &f.admin.0, json!({"display_name": "X"}))
                .await
                .0,
            403
        );
        assert_eq!(
            patch(s, who, &f.guest.0, json!({"role": "member"})).await.0,
            403
        );
        assert_eq!(delete(s, who, &f.s.user_id).await, 403);
    }
    // Everyone renames themselves.
    assert_eq!(
        patch(s, &f.member.1, &f.member.0, json!({"display_name": "Cri"}))
            .await
            .0,
        200
    );
    assert_eq!(
        patch(s, &f.guest.1, &f.guest.0, json!({"display_name": "Dio"}))
            .await
            .0,
        200
    );
    // But not their own role.
    assert_eq!(
        patch(s, &f.member.1, &f.member.0, json!({"role": "admin"}))
            .await
            .0,
        403
    );
    assert_eq!(
        patch(s, &f.guest.1, &f.guest.0, json!({"role": "member"}))
            .await
            .0,
        403
    );
}

#[tokio::test]
async fn patch_validation_and_not_found() {
    let f = family().await;
    let s = &f.s.state;
    let o = &f.s.session;
    for body in [
        json!({"role": "owner"}),
        json!({"role": "king"}),
        json!({"display_name": "   "}),
        json!({"display_name": "x".repeat(61)}),
    ] {
        let (st, b) = patch(s, o, &f.member.0, body.clone()).await;
        assert_eq!(
            (st, b["error_code"].as_str()),
            (422, Some("validation")),
            "{body}"
        );
    }
    let (st, b) = patch(s, o, &f.member.0, json!({"display_name": "x".repeat(60)})).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(
        patch(s, o, "nobody", json!({"display_name": "X"})).await.0,
        404
    );
    assert_eq!(delete(s, o, "nobody").await, 404);
    // Nothing above changed the role.
    assert_eq!(role_of(s, &f.member.0).await, "member");
}

#[tokio::test]
async fn removing_a_person_cleans_up_after_them() {
    let f = family().await;
    let s = &f.s.state;
    let lib = &f.s.library_id;
    let who = &f.member.0;
    let book = insert_book(s, lib, "Dune").await;
    let other_book = insert_book(s, lib, "Emma").await;
    sql(
        s,
        "UPDATE books SET owner_user_id = ?1 WHERE id = ?2",
        vec![who.clone(), book.clone()],
    )
    .await;
    sql(
        s,
        "INSERT INTO loans (id, library_id, book_id, borrower_name, borrower_user_id, lent_at)
         VALUES ('loan1', ?1, ?2, 'Carla', ?3, 5)",
        vec![lib.clone(), book.clone(), who.clone()],
    )
    .await;
    sql(
        s,
        "INSERT INTO reading (id, library_id, user_id, book_id, status, updated_at)
         VALUES ('r1', ?1, ?2, ?3, 'read', 1)",
        vec![lib.clone(), who.clone(), other_book],
    )
    .await;
    sql(
        s,
        "INSERT INTO wishlist (id, library_id, user_id, title, created_at)
         VALUES ('w1', ?1, ?2, 'Ulisse', 1)",
        vec![lib.clone(), who.clone()],
    )
    .await;
    // A code the person created.
    let (st, _, _) = call(
        s,
        "POST",
        "/api/v1/pairing/codes",
        Some(tok(&f.member.1)),
        None,
    )
    .await;
    assert_eq!(st, 201);
    assert_eq!(
        count(
            s,
            "SELECT COUNT(*) FROM pairing_codes WHERE created_by = ?1",
            who
        )
        .await,
        1
    );
    // Before: the session works.
    assert_eq!(
        call(s, "GET", "/api/v1/books", Some(tok(&f.member.1)), None)
            .await
            .0,
        200
    );

    assert_eq!(delete(s, &f.admin.1, who).await, 204);

    let (st, _, b) = call(s, "GET", "/api/v1/books", Some(tok(&f.member.1)), None).await;
    assert_eq!(st, 401, "{b}");
    assert_eq!(
        count(s, "SELECT COUNT(*) FROM users WHERE id = ?1", who).await,
        0
    );
    assert_eq!(
        count(s, "SELECT COUNT(*) FROM devices WHERE user_id = ?1", who).await,
        0
    );
    assert_eq!(
        count(s, "SELECT COUNT(*) FROM reading WHERE user_id = ?1", who).await,
        0
    );
    assert_eq!(
        count(s, "SELECT COUNT(*) FROM wishlist WHERE user_id = ?1", who).await,
        0
    );
    assert_eq!(
        count(
            s,
            "SELECT COUNT(*) FROM pairing_codes WHERE created_by = ?1",
            who
        )
        .await,
        0
    );
    assert_eq!(
        count(
            s,
            "SELECT COUNT(*) FROM books WHERE id = ?1 AND owner_user_id IS NULL",
            &book
        )
        .await,
        1
    );
    assert_eq!(
        count(s, "SELECT COUNT(*) FROM loans WHERE borrower_user_id IS NULL AND borrower_name = 'Carla' AND book_id = ?1", &book).await,
        1
    );
}

#[tokio::test]
async fn leaving_the_library_is_voluntary_and_not_for_the_owner() {
    let f = family().await;
    let s = &f.s.state;
    assert_eq!(delete(s, &f.guest.1, &f.guest.0).await, 204);
    assert_eq!(
        call(s, "GET", "/api/v1/users", Some(tok(&f.guest.1)), None)
            .await
            .0,
        401
    );
    assert_eq!(delete(s, &f.admin.1, &f.admin.0).await, 204);
    assert_eq!(delete(s, &f.s.session, &f.s.user_id).await, 403);
    let (_, _, body) = call(s, "GET", "/api/v1/users", Some(tok(&f.s.session)), None).await;
    assert_eq!(body["items"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn transferring_ownership_swaps_roles() {
    let f = family().await;
    let s = &f.s.state;
    let url = |id: &str| format!("/api/v1/users/{id}/owner");
    // Not for admins (or anyone below).
    for who in [&f.admin.1, &f.member.1, &f.guest.1] {
        let (st, _, b) = call(s, "POST", &url(&f.member.0), Some(tok(who)), None).await;
        assert_eq!((st, b["error_code"].as_str()), (403, Some("forbidden")));
    }
    // Not to oneself.
    let (st, _, b) = call(s, "POST", &url(&f.s.user_id), Some(tok(&f.s.session)), None).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
    assert_eq!(
        call(s, "POST", &url("nobody"), Some(tok(&f.s.session)), None)
            .await
            .0,
        404
    );
    assert_eq!(role_of(s, &f.s.user_id).await, "owner");

    let (st, _, _) = call(s, "POST", &url(&f.guest.0), Some(tok(&f.s.session)), None).await;
    assert_eq!(st, 204);
    assert_eq!(role_of(s, &f.guest.0).await, "owner");
    assert_eq!(role_of(s, &f.s.user_id).await, "admin");
    assert_eq!(
        count(
            s,
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND library_id = ?1",
            &f.s.library_id
        )
        .await,
        1
    );
    // The roles read from the database apply at once.
    let (st, _, _) = call(s, "POST", &url(&f.s.user_id), Some(tok(&f.s.session)), None).await;
    assert_eq!(st, 403);
    let (st, _, _) = call(s, "POST", &url(&f.s.user_id), Some(tok(&f.guest.1)), None).await;
    assert_eq!(st, 204);
    assert_eq!(role_of(s, &f.s.user_id).await, "owner");
}

#[tokio::test]
async fn other_libraries_are_invisible() {
    let f = family().await;
    let s = &f.s.state;
    let (_, other) = other_library(s).await;
    let (_, _, mine) = call(s, "GET", "/api/v1/users", Some(tok(&other)), None).await;
    assert_eq!(mine["items"].as_array().unwrap().len(), 1);
    for who in [&f.s.session] {
        assert_eq!(delete(s, who, &other.device_id).await, 404);
    }
    // A foreign user id, as seen from this library.
    let other_user: String =
        s.db.run(|c| {
            c.query_row("SELECT id FROM users WHERE display_name = 'Bea'", [], |r| {
                r.get(0)
            })
        })
        .await
        .unwrap();
    assert_eq!(
        patch(s, &f.s.session, &other_user, json!({"display_name": "X"}))
            .await
            .0,
        404
    );
    assert_eq!(delete(s, &f.s.session, &other_user).await, 404);
    let (st, _, _) = call(
        s,
        "POST",
        &format!("/api/v1/users/{other_user}/owner"),
        Some(tok(&f.s.session)),
        None,
    )
    .await;
    assert_eq!(st, 404);
    assert_eq!(role_of(s, &other_user).await, "owner");
}

#[tokio::test]
async fn actions_are_audited() {
    let f = family().await;
    let s = &f.s.state;
    patch(
        s,
        &f.s.session,
        &f.member.0,
        json!({"role": "guest", "display_name": "Cri"}),
    )
    .await;
    // No change, no entry.
    patch(s, &f.s.session, &f.member.0, json!({"display_name": "Cri"})).await;
    delete(s, &f.s.session, &f.guest.0).await;
    call(
        s,
        "POST",
        &format!("/api/v1/users/{}/owner", f.admin.0),
        Some(tok(&f.s.session)),
        None,
    )
    .await;
    let rows = audit_rows(s, &f.s.library_id).await;
    assert_eq!(
        rows,
        vec![
            (
                "user.update".to_string(),
                "user".to_string(),
                f.member.0.clone()
            ),
            (
                "user.remove".to_string(),
                "user".to_string(),
                f.guest.0.clone()
            ),
            (
                "library.owner".to_string(),
                "library".to_string(),
                f.s.library_id.clone()
            ),
        ]
    );
    let details: Vec<Option<String>> =
        s.db.run(|c| {
            let mut st = c.prepare("SELECT detail_json FROM audit_log ORDER BY id")?;
            let r = st.query_map([], |r| r.get(0))?;
            r.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .unwrap();
    let update: Value = serde_json::from_str(details[0].as_ref().unwrap()).unwrap();
    assert_eq!(update, json!({"display_name": "Cri", "role": "guest"}));
    let remove: Value = serde_json::from_str(details[1].as_ref().unwrap()).unwrap();
    assert_eq!(remove["display_name"], "Dino");
    let owner: Value = serde_json::from_str(details[2].as_ref().unwrap()).unwrap();
    assert_eq!(owner, json!({"from": f.s.user_id, "to": f.admin.0}));
}

#[tokio::test]
async fn users_need_a_token() {
    let f = family().await;
    let (st, _, _) = call(&f.s.state, "GET", "/api/v1/users", None, None).await;
    assert_eq!(st, 401);
}
