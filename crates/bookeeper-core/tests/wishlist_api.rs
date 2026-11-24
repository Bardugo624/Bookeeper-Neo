mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn req(s: &Seeded, method: &str, path: &str, body: Option<Value>) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(&s.session.access_token), body).await;
    (st, b)
}

async fn req_as(
    s: &Seeded,
    token: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(token), body).await;
    (st, b)
}

async fn wish(s: &Seeded, body: Value) -> Value {
    let (st, b) = req(s, "POST", "/api/v1/wishlist", Some(body)).await;
    assert_eq!(st, 201, "{b}");
    b
}

async fn convert(s: &Seeded, w: Value) -> (u16, Value) {
    let id = w["id"].as_str().unwrap().to_string();
    req(s, "POST", &format!("/api/v1/wishlist/{id}/convert"), None).await
}

#[tokio::test]
async fn create_defaults_priority_to_zero() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "Dune"})).await;
    assert_eq!(w["priority"], 0);
    assert_eq!(w["user_id"], s.user_id);
    assert!(w["isbn"].is_null() && w["authors"].is_null());
}

#[tokio::test]
async fn validation_table() {
    let s = seed(Role::Owner, None, None).await;
    let cases = [
        json!({"title": ""}),
        json!({"title": "x".repeat(301)}),
        json!({"title": "A", "priority": 3}),
        json!({"title": "A", "priority": -1}),
        json!({"title": "A", "source_url": "u".repeat(2001)}),
    ];
    for c in cases {
        let (st, _) = req(&s, "POST", "/api/v1/wishlist", Some(c.clone())).await;
        assert_eq!(st, 422, "{c}");
    }
}

#[tokio::test]
async fn list_is_personal_and_ordered() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    wish(&s, json!({"title": "low", "priority": 0})).await;
    wish(&s, json!({"title": "high", "priority": 2})).await;
    wish(&s, json!({"title": "low-newer", "priority": 0})).await;
    let (st, _) = req_as(
        &s,
        &other.access_token,
        "POST",
        "/api/v1/wishlist",
        Some(json!({"title": "bob"})),
    )
    .await;
    assert_eq!(st, 201);
    let (_, b) = req(&s, "GET", "/api/v1/wishlist", None).await;
    let titles: Vec<&str> = b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles.len(), 3);
    assert_eq!(titles[0], "high");
    let (_, b) = req_as(&s, &other.access_token, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(b["items"].as_array().unwrap().len(), 1);
    assert_eq!(b["items"][0]["title"], "bob");
}

#[tokio::test]
async fn patch_changes_and_clears() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "A", "notes": "n", "authors": "X"})).await;
    let path = format!("/api/v1/wishlist/{}", w["id"].as_str().unwrap());
    let (st, b) = req(
        &s,
        "PATCH",
        &path,
        Some(json!({"title": "B", "priority": 2, "notes": null})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["title"], "B");
    assert_eq!(b["priority"], 2);
    assert!(b["notes"].is_null());
    assert_eq!(b["authors"], "X");
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"title": null}))).await;
    assert_eq!(st, 422);
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"priority": 5}))).await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn delete_removes_the_item() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "A"})).await;
    let path = format!("/api/v1/wishlist/{}", w["id"].as_str().unwrap());
    let (st, _) = req(&s, "DELETE", &path, None).await;
    assert_eq!(st, 204);
    let (st, _) = req(&s, "DELETE", &path, None).await;
    assert_eq!(st, 404);
    let (_, b) = req(&s, "GET", "/api/v1/wishlist", None).await;
    assert!(b["items"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn another_users_item_is_not_found_even_for_the_owner_role() {
    let s = seed(Role::Owner, None, None).await;
    let (_, bob) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let (st, w) = req_as(
        &s,
        &bob.access_token,
        "POST",
        "/api/v1/wishlist",
        Some(json!({"title": "bob"})),
    )
    .await;
    assert_eq!(st, 201);
    let path = format!("/api/v1/wishlist/{}", w["id"].as_str().unwrap());
    let (_, b) = req(&s, "GET", "/api/v1/wishlist", None).await;
    assert!(b["items"].as_array().unwrap().is_empty());
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"title": "x"}))).await;
    assert_eq!(st, 404);
    let (st, _) = req(&s, "DELETE", &path, None).await;
    assert_eq!(st, 404);
    let (st, _) = req(&s, "POST", &format!("{path}/convert"), None).await;
    assert_eq!(st, 404);
    // still there for Bob
    let (_, b) = req_as(&s, &bob.access_token, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(b["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn convert_creates_a_book_and_removes_the_item() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "Dune", "notes": "gift"})).await;
    let (st, book) = convert(&s, w).await;
    assert_eq!(st, 201, "{book}");
    assert_eq!(book["title"], "Dune");
    assert_eq!(book["notes"], "gift");
    let (st, got) = req(
        &s,
        "GET",
        &format!("/api/v1/books/{}", book["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(got["title"], "Dune");
    let (_, b) = req(&s, "GET", "/api/v1/wishlist", None).await;
    assert!(b["items"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn convert_splits_authors_on_commas() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(
        &s,
        json!({"title": "T", "authors": "Eco, Umberto ,, Calvino"}),
    )
    .await;
    let (st, book) = convert(&s, w).await;
    assert_eq!(st, 201, "{book}");
    assert_eq!(book["authors"], json!(["Eco", "Umberto", "Calvino"]));
}

#[tokio::test]
async fn convert_maps_the_isbn() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "B", "isbn": "978-0-306-40615-7"})).await;
    let (_, b) = convert(&s, w).await;
    assert_eq!(b["isbn_13"], "9780306406157");
    assert!(b["isbn_10"].is_null());
    let w = wish(&s, json!({"title": "C", "isbn": "0-306-40615-2"})).await;
    let (_, b) = convert(&s, w).await;
    assert_eq!(b["isbn_10"], "0306406152");
    assert!(b["isbn_13"].is_null());
    let w = wish(&s, json!({"title": "D", "isbn": "not an isbn"})).await;
    let (st, b) = convert(&s, w).await;
    assert_eq!(st, 201);
    assert!(b["isbn_10"].is_null() && b["isbn_13"].is_null());
}

#[tokio::test]
async fn converted_book_is_searchable() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "Zibaldone"})).await;
    let (st, _) = convert(&s, w).await;
    assert_eq!(st, 201);
    let n: i64 = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM books_fts WHERE books_fts MATCH 'Zibaldone'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn convert_twice_is_not_found() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "A"})).await;
    let (st, _) = convert(&s, w.clone()).await;
    assert_eq!(st, 201);
    let (st, _) = convert(&s, w).await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn convert_is_atomic() {
    let s = seed(Role::Owner, None, None).await;
    let (id, uid, lib) = (
        "w-long".to_string(),
        s.user_id.clone(),
        s.library_id.clone(),
    );
    let id2 = id.clone();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO wishlist (id, library_id, user_id, title, priority, created_at) VALUES (?1, ?2, ?3, ?4, 0, 1)",
                rusqlite::params![id2, lib, uid, "x".repeat(400)],
            )
        })
        .await
        .unwrap();
    let (st, _) = req(&s, "POST", &format!("/api/v1/wishlist/{id}/convert"), None).await;
    assert_eq!(st, 422);
    let books: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(books, 0);
    let (_, b) = req(&s, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(b["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn guest_cannot_write() {
    let s = seed(Role::Owner, None, None).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gus").await;
    let g = &guest.access_token;
    let (st, b) = req_as(&s, g, "GET", "/api/v1/wishlist", None).await;
    assert_eq!(st, 200);
    assert!(b["items"].as_array().unwrap().is_empty());
    for (m, p, body) in [
        ("POST", "/api/v1/wishlist", Some(json!({"title": "A"}))),
        ("PATCH", "/api/v1/wishlist/x", Some(json!({"title": "A"}))),
        ("DELETE", "/api/v1/wishlist/x", None),
        ("POST", "/api/v1/wishlist/x/convert", None),
    ] {
        let (st, _) = req_as(&s, g, m, p, body).await;
        assert_eq!(st, 403, "{m} {p}");
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    for (m, p) in [
        ("GET", "/api/v1/wishlist"),
        ("POST", "/api/v1/wishlist"),
        ("PATCH", "/api/v1/wishlist/x"),
        ("DELETE", "/api/v1/wishlist/x"),
        ("POST", "/api/v1/wishlist/x/convert"),
    ] {
        let (st, _, _) = call(&s.state, m, p, None, Some(json!({}))).await;
        assert_eq!(st, 401, "{m} {p}");
    }
}

#[tokio::test]
async fn mutations_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let w = wish(&s, json!({"title": "A"})).await;
    let wid = w["id"].as_str().unwrap().to_string();
    let w2 = wish(&s, json!({"title": "B"})).await;
    req(
        &s,
        "PATCH",
        &format!("/api/v1/wishlist/{wid}"),
        Some(json!({"priority": 1})),
    )
    .await;
    req(&s, "DELETE", &format!("/api/v1/wishlist/{wid}"), None).await;
    let (st, _) = convert(&s, w2.clone()).await;
    assert_eq!(st, 201);
    let rows = audit_rows(&s.state, &s.library_id).await;
    let actions: Vec<&str> = rows.iter().map(|r| r.0.as_str()).collect();
    for a in [
        "wishlist.create",
        "wishlist.update",
        "wishlist.delete",
        "book.create",
        "wishlist.convert",
    ] {
        assert!(actions.contains(&a), "missing {a}: {actions:?}");
    }
    assert!(rows.iter().any(|r| r.0 == "wishlist.convert"
        && r.1 == "wishlist"
        && r.2 == w2["id"].as_str().unwrap()));
}
