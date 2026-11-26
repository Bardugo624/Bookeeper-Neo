mod common;

use bookeeper_core::auth::{Role, Session};
use common::*;
use serde_json::{json, Value};

async fn req(
    s: &Seeded,
    who: &Session,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(&who.access_token), body).await;
    (st, b)
}

fn ids(v: &Value, key: &str) -> Vec<String> {
    v["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i[key].as_str().unwrap().to_string())
        .collect()
}

// ---------------------------------------------------------------- owner

#[tokio::test]
async fn owner_set_clear_and_shown_everywhere() {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, _) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let (st, b) = req(
        &s,
        &s.session,
        "POST",
        "/api/v1/books",
        Some(json!({"title": "Dune", "owner_user_id": bruno})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    assert_eq!(b["owner"], json!({"id": bruno, "display_name": "Bruno"}));
    let id = b["id"].as_str().unwrap().to_string();

    let (_, d) = req(&s, &s.session, "GET", &format!("/api/v1/books/{id}"), None).await;
    assert_eq!(d["owner"]["display_name"], "Bruno");
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/books", None).await;
    assert_eq!(l["items"][0]["owner"]["id"], bruno.as_str());

    // Patch without the field keeps it; null clears it.
    let (st, p) = req(
        &s,
        &s.session,
        "PATCH",
        &format!("/api/v1/books/{id}"),
        Some(json!({"title": "Dune 2"})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(p["owner"]["id"], bruno.as_str());
    let (st, p) = req(
        &s,
        &s.session,
        "PATCH",
        &format!("/api/v1/books/{id}"),
        Some(json!({"owner_user_id": null})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(p["owner"], Value::Null);
    let me = s.user_id.clone();
    let (_, p) = req(
        &s,
        &s.session,
        "PATCH",
        &format!("/api/v1/books/{id}"),
        Some(json!({"owner_user_id": me})),
    )
    .await;
    assert_eq!(p["owner"]["display_name"], "Ada");
}

#[tokio::test]
async fn owner_other_library_unknown_and_guest() {
    let s = seed(Role::Owner, None, None).await;
    let (stranger, _) = other_library(&s.state).await;
    let foreign_user: String = {
        let lib = stranger.clone();
        s.state
            .db
            .run(move |c| {
                c.query_row("SELECT id FROM users WHERE library_id = ?1", [lib], |r| {
                    r.get(0)
                })
            })
            .await
            .unwrap()
    };
    for who in [foreign_user.as_str(), "nope"] {
        let (st, b) = req(
            &s,
            &s.session,
            "POST",
            "/api/v1/books",
            Some(json!({"title": "X", "owner_user_id": who})),
        )
        .await;
        assert_eq!(st, 404, "{b}");
        assert_eq!(b["error_code"], "not_found");
    }
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (st, _) = req(
        &s,
        &s.session,
        "PATCH",
        &format!("/api/v1/books/{book}"),
        Some(json!({"owner_user_id": foreign_user})),
    )
    .await;
    assert_eq!(st, 404);
    // Nothing was created by the failed POSTs.
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/books", None).await;
    assert_eq!(l["total"], 1);

    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gina").await;
    let (st, _) = req(
        &s,
        &guest,
        "PATCH",
        &format!("/api/v1/books/{book}"),
        Some(json!({"owner_user_id": s.user_id})),
    )
    .await;
    assert_eq!(st, 403);
    let (st, _) = req(
        &s,
        &guest,
        "POST",
        "/api/v1/books",
        Some(json!({"title": "X", "owner_user_id": s.user_id})),
    )
    .await;
    assert_eq!(st, 403);
}

async fn owned_library() -> (Seeded, String, String, [String; 3]) {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, bs) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let _ = bs;
    let mk = |title: &'static str, owner: Option<String>| {
        let s = &s;
        async move {
            let (st, b) = req(
                s,
                &s.session,
                "POST",
                "/api/v1/books",
                Some(json!({"title": title, "owner_user_id": owner})),
            )
            .await;
            assert_eq!(st, 201, "{b}");
            b["id"].as_str().unwrap().to_string()
        }
    };
    let a = mk("A", Some(s.user_id.clone())).await;
    let b = mk("B", Some(bruno.clone())).await;
    let c = mk("C", Some(bruno.clone())).await;
    let _d = mk("D", None).await;
    let me = s.user_id.clone();
    (s, me, bruno, [a, b, c])
}

#[tokio::test]
async fn owner_filter_and_facets() {
    let (s, me, bruno, [a, b, c]) = owned_library().await;
    let titles = |v: &Value| {
        let mut t = ids(v, "title");
        t.sort();
        t
    };
    let (_, l) = req(
        &s,
        &s.session,
        "GET",
        &format!("/api/v1/books?owner_id={bruno}"),
        None,
    )
    .await;
    assert_eq!(titles(&l), ["B", "C"]);
    assert_eq!(l["total"], 2);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/books?owner_id=me", None).await;
    assert_eq!(titles(&l), ["A"]);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/books?owner_id=none", None).await;
    assert_eq!(titles(&l), ["D"]);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/books?owner_id=ghost", None).await;
    assert_eq!(l["total"], 0);
    // Combines with the other filters.
    let (_, l) = req(
        &s,
        &s.session,
        "GET",
        &format!("/api/v1/books?owner_id={bruno}&q=C"),
        None,
    )
    .await;
    assert_eq!(titles(&l), ["C"]);
    let _ = (a, b, c);

    let (_, f) = req(&s, &s.session, "GET", "/api/v1/books/facets", None).await;
    assert_eq!(f["owner_none"], 1);
    assert_eq!(
        f["owners"],
        json!([
            {"id": bruno, "display_name": "Bruno", "count": 2},
            {"id": me, "display_name": "Ada", "count": 1},
        ])
    );
}

#[tokio::test]
async fn facets_list_only_people_with_books() {
    let s = seed(Role::Owner, None, None).await;
    add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    insert_book(&s.state, &s.library_id, "Dune").await;
    let (_, f) = req(&s, &s.session, "GET", "/api/v1/books/facets", None).await;
    assert_eq!(f["owners"], json!([]));
    assert_eq!(f["owner_none"], 1);
}

#[tokio::test]
async fn removed_person_leaves_book_without_owner() {
    let (s, _me, bruno, [_, b, _]) = owned_library().await;
    let (st, _) = req(
        &s,
        &s.session,
        "DELETE",
        &format!("/api/v1/users/{bruno}"),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let (_, d) = req(&s, &s.session, "GET", &format!("/api/v1/books/{b}"), None).await;
    assert_eq!(d["owner"], Value::Null);
    let (_, f) = req(&s, &s.session, "GET", "/api/v1/books/facets", None).await;
    assert_eq!(f["owner_none"], 3);
    assert_eq!(f["owners"].as_array().unwrap().len(), 1);
}

// -------------------------------------------------------------- readers

#[tokio::test]
async fn readers_order_privacy_and_is_me() {
    let s = seed(Role::Owner, None, None).await;
    let (_, bruno) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let (_, carla) = add_user(&s.state, &s.library_id, Role::Member, "Carla").await;
    let (_, dino) = add_user(&s.state, &s.library_id, Role::Guest, "Dino").await;
    let (_, elsa) = add_user(&s.state, &s.library_id, Role::Member, "Elsa").await;
    let (_, fabio) = add_user(&s.state, &s.library_id, Role::Member, "Fabio").await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let put = |who: &Session, body: Value| {
        let path = format!("/api/v1/books/{book}/reading");
        let (state, tok) = (s.state.clone(), who.access_token.clone());
        async move {
            let (st, _, b) = call(&state, "PUT", &path, Some(&tok), Some(body)).await;
            assert_eq!(st, 200, "{b}");
        }
    };
    // Ada: abandoned; Bruno: read early; Carla: read later; Dino: to_read; Elsa: reading.
    put(
        &s.session,
        json!({"status": "abandoned", "rating": 2, "note": "segreto", "current_page": 5}),
    )
    .await;
    put(
        &bruno,
        json!({"status": "read", "finished_at": 1000, "rating": 5, "note": "bello"}),
    )
    .await;
    put(&carla, json!({"status": "read", "finished_at": 2000, "rating": 4, "note": "ok", "current_page": 3})).await;
    put(&dino, json!({"status": "to_read"})).await;
    put(
        &elsa,
        json!({"status": "reading", "started_at": 500, "current_page": 7, "note": "n"}),
    )
    .await;
    let _ = fabio; // no state: absent

    let (st, r) = req(
        &s,
        &s.session,
        "GET",
        &format!("/api/v1/books/{book}/readers"),
        None,
    )
    .await;
    assert_eq!(st, 200, "{r}");
    let order: Vec<String> = ids(&r, "status");
    assert_eq!(order, ["reading", "to_read", "read", "read", "abandoned"]);
    let names: Vec<String> = r["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["user"]["display_name"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(names, ["Elsa", "Dino", "Carla", "Bruno", "Ada"]);
    let me: Vec<bool> = r["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["is_me"].as_bool().unwrap())
        .collect();
    assert_eq!(me, [false, false, false, false, true]);

    // Exact shape: nothing private leaks, not even for the caller.
    for item in r["items"].as_array().unwrap() {
        let mut keys: Vec<&str> = item
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort();
        assert_eq!(
            keys,
            ["finished_at", "is_me", "started_at", "status", "user"]
        );
        let mut ukeys: Vec<&str> = item["user"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        ukeys.sort();
        assert_eq!(ukeys, ["display_name", "id"]);
    }
    let text = r.to_string();
    for secret in ["segreto", "bello", "rating", "note", "current_page"] {
        assert!(!text.contains(secret), "{secret} leaked: {text}");
    }
    assert_eq!(r["items"][3]["finished_at"], 1000);
    assert_eq!(r["items"][0]["started_at"], 500);

    // Seen from another person, is_me follows the caller; a guest can read too.
    let (st, r2) = req(
        &s,
        &dino,
        "GET",
        &format!("/api/v1/books/{book}/readers"),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(r2["items"][1]["is_me"], true);
    assert_eq!(r2["items"][4]["is_me"], false);
}

#[tokio::test]
async fn readers_empty_and_not_found() {
    let s = seed(Role::Member, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (st, r) = req(
        &s,
        &s.session,
        "GET",
        &format!("/api/v1/books/{book}/readers"),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(r, json!({"items": []}));

    let (other, _) = other_library(&s.state).await;
    let foreign = insert_book(&s.state, &other, "Altro").await;
    for id in [foreign.as_str(), "nope"] {
        let (st, b) = req(
            &s,
            &s.session,
            "GET",
            &format!("/api/v1/books/{id}/readers"),
            None,
        )
        .await;
        assert_eq!(st, 404);
        assert_eq!(b["error_code"], "not_found");
    }
    let (st, _, _) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{book}/readers"),
        None,
        None,
    )
    .await;
    assert_eq!(st, 401);
}

// ------------------------------------------------------------- wishlist

async fn wish(s: &Seeded, who: &Session, title: &str, priority: i64) -> Value {
    let (st, b) = req(
        s,
        who,
        "POST",
        "/api/v1/wishlist",
        Some(json!({"title": title, "priority": priority})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    b
}

#[tokio::test]
async fn wishlist_mine_is_unchanged_and_has_user() {
    let s = seed(Role::Owner, None, None).await;
    let (_, bruno) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let mine = wish(&s, &s.session, "Mia", 0).await;
    wish(&s, &bruno, "Sua", 2).await;
    assert_eq!(
        mine["user"],
        json!({"id": s.user_id, "display_name": "Ada"})
    );
    assert_eq!(mine["user_id"], s.user_id.as_str());
    for path in ["/api/v1/wishlist", "/api/v1/wishlist?scope=mine"] {
        let (st, l) = req(&s, &s.session, "GET", path, None).await;
        assert_eq!(st, 200);
        assert_eq!(ids(&l, "title"), ["Mia"]);
    }
    let (st, b) = req(&s, &s.session, "GET", "/api/v1/wishlist?scope=all", None).await;
    assert_eq!(st, 422);
    assert_eq!(b["error_code"], "validation");
}

#[tokio::test]
async fn wishlist_family_order_and_guest() {
    let s = seed(Role::Owner, None, None).await;
    let (_, carla) = add_user(&s.state, &s.library_id, Role::Member, "carla").await;
    let (_, bruno) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gina").await;
    wish(&s, &carla, "C-alta", 2).await;
    wish(&s, &bruno, "B-bassa", 0).await;
    wish(&s, &s.session, "A-bassa", 0).await;
    wish(&s, &bruno, "B-alta", 2).await;
    wish(&s, &s.session, "A-alta", 1).await;

    let (_, l) = req(&s, &s.session, "GET", "/api/v1/wishlist?scope=family", None).await;
    // Caller first, then by person name (case-insensitive), then priority.
    assert_eq!(
        ids(&l, "title"),
        ["A-alta", "A-bassa", "B-alta", "B-bassa", "C-alta"]
    );
    assert_eq!(l["items"][2]["user"]["display_name"], "Bruno");

    // Seen by Bruno, his own come first.
    let (_, l) = req(&s, &bruno, "GET", "/api/v1/wishlist?scope=family", None).await;
    assert_eq!(
        ids(&l, "title"),
        ["B-alta", "B-bassa", "A-alta", "A-bassa", "C-alta"]
    );

    // A guest reads the family list and has none of their own.
    let (st, l) = req(&s, &guest, "GET", "/api/v1/wishlist?scope=family", None).await;
    assert_eq!(st, 200);
    assert_eq!(l["items"].as_array().unwrap().len(), 5);
    let (_, l) = req(&s, &guest, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(l["items"], json!([]));
}

#[tokio::test]
async fn wishlist_writes_on_other_peoples_items_are_404() {
    let s = seed(Role::Owner, None, None).await;
    let (_, bruno) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let theirs = wish(&s, &bruno, "Sua", 0).await["id"]
        .as_str()
        .unwrap()
        .to_string();
    let p = format!("/api/v1/wishlist/{theirs}");
    let (st, _) = req(&s, &s.session, "PATCH", &p, Some(json!({"title": "X"}))).await;
    assert_eq!(st, 404);
    let (st, _) = req(&s, &s.session, "DELETE", &p, None).await;
    assert_eq!(st, 404);
    let (st, _) = req(&s, &s.session, "POST", &format!("{p}/convert"), None).await;
    assert_eq!(st, 404);
    let (_, l) = req(&s, &bruno, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(ids(&l, "title"), ["Sua"]);
}

// ---------------------------------------------------------------- loans

async fn loan(s: &Seeded, body: Value) -> (u16, Value) {
    req(s, &s.session, "POST", "/api/v1/loans", Some(body)).await
}

#[tokio::test]
async fn loan_to_a_person_stores_their_name() {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, _) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (st, l) = loan(&s, json!({"book_id": book, "borrower_user_id": bruno})).await;
    assert_eq!(st, 201, "{l}");
    assert_eq!(l["borrower_name"], "Bruno");
    assert_eq!(l["borrower_user_id"], bruno.as_str());
    assert_eq!(l["borrower"], json!({"id": bruno, "display_name": "Bruno"}));

    // A free-text loan has no borrower object.
    let book2 = insert_book(&s.state, &s.library_id, "Emma").await;
    let (_, l2) = loan(&s, json!({"book_id": book2, "borrower_name": "Marta"})).await;
    assert_eq!(l2["borrower"], Value::Null);

    // The name typed alongside a person is replaced by the person's name; lending to oneself works.
    let book3 = insert_book(&s.state, &s.library_id, "Kim").await;
    let (st, l3) = loan(
        &s,
        json!({"book_id": book3, "borrower_user_id": s.user_id, "borrower_name": "altro"}),
    )
    .await;
    assert_eq!(st, 201);
    assert_eq!(l3["borrower_name"], "Ada");
}

#[tokio::test]
async fn loan_person_checks() {
    let s = seed(Role::Owner, None, None).await;
    let (other, _) = other_library(&s.state).await;
    let foreign_user: String = s
        .state
        .db
        .run(move |c| {
            c.query_row("SELECT id FROM users WHERE library_id = ?1", [other], |r| {
                r.get(0)
            })
        })
        .await
        .unwrap();
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    for u in [foreign_user.as_str(), "nope"] {
        let (st, b) = loan(&s, json!({"book_id": book, "borrower_user_id": u})).await;
        assert_eq!(st, 404, "{b}");
        assert_eq!(b["error_code"], "not_found");
    }
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/loans?status=all", None).await;
    assert_eq!(l["total"], 0);
    for body in [
        json!({"book_id": book}),
        json!({"book_id": book, "borrower_user_id": null}),
        json!({"book_id": book, "borrower_name": "  "}),
    ] {
        let (st, b) = loan(&s, body).await;
        assert_eq!(st, 422, "{b}");
        assert_eq!(b["error_code"], "validation");
    }
}

#[tokio::test]
async fn loan_patch_sets_and_clears_the_person() {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, _) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (_, l) = loan(&s, json!({"book_id": book, "borrower_name": "Marta"})).await;
    let id = l["id"].as_str().unwrap().to_string();
    let path = format!("/api/v1/loans/{id}");

    let (st, p) = req(
        &s,
        &s.session,
        "PATCH",
        &path,
        Some(json!({"borrower_user_id": bruno})),
    )
    .await;
    assert_eq!(st, 200, "{p}");
    assert_eq!(p["borrower_name"], "Bruno");
    assert_eq!(p["borrower"]["id"], bruno.as_str());

    // An unrelated patch keeps the link.
    let (_, p) = req(&s, &s.session, "PATCH", &path, Some(json!({"notes": "x"}))).await;
    assert_eq!(p["borrower_user_id"], bruno.as_str());

    // `null` removes the link and keeps the stored name.
    let (st, p) = req(
        &s,
        &s.session,
        "PATCH",
        &path,
        Some(json!({"borrower_user_id": null})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(p["borrower_user_id"], Value::Null);
    assert_eq!(p["borrower"], Value::Null);
    assert_eq!(p["borrower_name"], "Bruno");

    let (st, _) = req(
        &s,
        &s.session,
        "PATCH",
        &path,
        Some(json!({"borrower_user_id": "nope"})),
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn loan_filter_by_borrower() {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, bs) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    let b2 = insert_book(&s.state, &s.library_id, "Due").await;
    let b3 = insert_book(&s.state, &s.library_id, "Tre").await;
    loan(&s, json!({"book_id": b1, "borrower_user_id": bruno})).await;
    loan(&s, json!({"book_id": b2, "borrower_user_id": s.user_id})).await;
    loan(&s, json!({"book_id": b3, "borrower_name": "Marta"})).await;

    let (_, l) = req(
        &s,
        &s.session,
        "GET",
        &format!("/api/v1/loans?borrower_user_id={bruno}"),
        None,
    )
    .await;
    assert_eq!(ids(&l, "book_title"), ["Uno"]);
    assert_eq!(l["total"], 1);
    let (_, l) = req(
        &s,
        &s.session,
        "GET",
        "/api/v1/loans?borrower_user_id=me",
        None,
    )
    .await;
    assert_eq!(ids(&l, "book_title"), ["Due"]);
    let (_, l) = req(&s, &bs, "GET", "/api/v1/loans?borrower_user_id=me", None).await;
    assert_eq!(ids(&l, "book_title"), ["Uno"]);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/loans", None).await;
    assert_eq!(l["total"], 3);
}

#[tokio::test]
async fn loan_borrower_shows_current_name_stored_name_stays() {
    let s = seed(Role::Owner, None, None).await;
    let (bruno, _) = add_user(&s.state, &s.library_id, Role::Member, "Bruno").await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (_, l) = loan(&s, json!({"book_id": book, "borrower_user_id": bruno})).await;
    let id = l["id"].as_str().unwrap().to_string();
    let (st, _) = req(
        &s,
        &s.session,
        "PATCH",
        &format!("/api/v1/users/{bruno}"),
        Some(json!({"display_name": "Brunone"})),
    )
    .await;
    assert_eq!(st, 200);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/loans", None).await;
    assert_eq!(l["items"][0]["borrower"]["display_name"], "Brunone");
    assert_eq!(l["items"][0]["borrower_name"], "Bruno");

    // Removing the person leaves the stored name and drops the object.
    let (st, _) = req(
        &s,
        &s.session,
        "DELETE",
        &format!("/api/v1/users/{bruno}"),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let (_, l) = req(&s, &s.session, "GET", "/api/v1/loans", None).await;
    assert_eq!(l["items"][0]["id"], id.as_str());
    assert_eq!(l["items"][0]["borrower"], Value::Null);
    assert_eq!(l["items"][0]["borrower_user_id"], Value::Null);
    assert_eq!(l["items"][0]["borrower_name"], "Bruno");
}
