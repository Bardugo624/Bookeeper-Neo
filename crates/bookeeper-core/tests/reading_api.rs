mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn req(
    s: &Seeded,
    token: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(token), body).await;
    (st, b)
}

fn rpath(book: &str) -> String {
    format!("/api/v1/books/{book}/reading")
}

async fn put(s: &Seeded, book: &str, body: Value) -> (u16, Value) {
    req(s, &s.session.access_token, "PUT", &rpath(book), Some(body)).await
}

async fn get(s: &Seeded, book: &str) -> (u16, Value) {
    req(s, &s.session.access_token, "GET", &rpath(book), None).await
}

async fn set_pages(s: &Seeded, book: &str, pages: i64) {
    let b = book.to_string();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET page_count = ?1 WHERE id = ?2",
                rusqlite::params![pages, b],
            )
        })
        .await
        .unwrap();
}

async fn setup() -> (Seeded, String) {
    let s = seed(Role::Owner, None, None).await;
    let b = insert_book(&s.state, &s.library_id, "Dune").await;
    (s, b)
}

#[tokio::test]
async fn create_replace_read_and_delete() {
    let (s, b) = setup().await;
    let (st, v) = get(&s, &b).await;
    assert_eq!((st, &v), (200, &Value::Null));

    let (st, v) = put(&s, &b, json!({"status": "reading", "started_at": 100, "rating": 3, "note": "inizio", "current_page": 12})).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["book_id"], b);
    assert_eq!(v["status"], "reading");
    assert_eq!(v["started_at"], 100);
    assert_eq!(v["current_page"], 12);
    assert!(v["updated_at"].as_i64().unwrap() > 0);

    // Replace: absent fields are cleared.
    let (st, v) = put(&s, &b, json!({"status": "abandoned"})).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["status"], "abandoned");
    assert!(v["rating"].is_null() && v["note"].is_null() && v["started_at"].is_null());
    let (_, g) = get(&s, &b).await;
    assert_eq!(g, v);
    let n: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM reading", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(n, 1);

    let (st, _) = req(&s, &s.session.access_token, "DELETE", &rpath(&b), None).await;
    assert_eq!(st, 204);
    let (_, g) = get(&s, &b).await;
    assert!(g.is_null());
    // Deleting again is still 204.
    let (st, _) = req(&s, &s.session.access_token, "DELETE", &rpath(&b), None).await;
    assert_eq!(st, 204);
}

#[tokio::test]
async fn validation_table() {
    let (s, b) = setup().await;
    set_pages(&s, &b, 100).await;
    let cases = [
        json!({"status": "done"}),
        json!({"status": "reading", "rating": 0}),
        json!({"status": "reading", "rating": 6}),
        json!({"status": "reading", "note": "x".repeat(2001)}),
        json!({"status": "read", "started_at": 10, "finished_at": 9}),
        json!({"status": "reading", "current_page": 101}),
        json!({"status": "reading", "current_page": -1}),
        json!({"rating": 3}),
    ];
    for c in cases {
        let (st, v) = put(&s, &b, c.clone()).await;
        assert_eq!(st, 422, "{c} {v}");
        assert_eq!(v["error_code"], "validation");
    }
    let (st, v) = put(
        &s,
        &b,
        json!({"status": "reading", "rating": 5, "note": "x".repeat(2000), "current_page": 100}),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    let (_, g) = get(&s, &b).await;
    assert_eq!(g["current_page"], 100);
}

#[tokio::test]
async fn page_is_not_checked_when_page_count_is_unknown() {
    let (s, b) = setup().await;
    let (st, v) = put(&s, &b, json!({"status": "reading", "current_page": 9999})).await;
    assert_eq!(st, 200, "{v}");
}

#[tokio::test]
async fn automatic_transitions() {
    let (s, b) = setup().await;
    set_pages(&s, &b, 250).await;
    let before = chrono_now();

    let (_, v) = put(&s, &b, json!({"status": "reading"})).await;
    assert!(v["started_at"].as_i64().unwrap() >= before);
    assert!(v["finished_at"].is_null());

    let (_, v) = put(&s, &b, json!({"status": "read", "current_page": 5})).await;
    assert!(v["finished_at"].as_i64().unwrap() >= before);
    assert_eq!(v["current_page"], 250);

    let (_, v) = put(
        &s,
        &b,
        json!({"status": "read", "started_at": 10, "finished_at": 20}),
    )
    .await;
    assert_eq!(
        (v["started_at"].as_i64(), v["finished_at"].as_i64()),
        (Some(10), Some(20))
    );

    let (_, v) = put(&s, &b, json!({"status": "to_read", "started_at": 1, "finished_at": 2, "current_page": 3, "rating": 4})).await;
    assert!(v["started_at"].is_null() && v["finished_at"].is_null() && v["current_page"].is_null());
    assert_eq!(v["rating"], 4);
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        - 1
}

#[tokio::test]
async fn read_without_page_count_keeps_the_given_page() {
    let (s, b) = setup().await;
    let (_, v) = put(&s, &b, json!({"status": "read", "current_page": 7})).await;
    assert_eq!(v["current_page"], 7);
    assert!(v["finished_at"].is_i64());
}

#[tokio::test]
async fn users_of_one_library_do_not_see_each_other() {
    let (s, b) = setup().await;
    let (_, other) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let ot = other.access_token.as_str();
    put(&s, &b, json!({"status": "read", "rating": 5})).await;

    let (st, v) = req(&s, ot, "GET", &rpath(&b), None).await;
    assert_eq!((st, &v), (200, &Value::Null));
    let (st, list) = req(&s, ot, "GET", "/api/v1/reading", None).await;
    assert_eq!(st, 200);
    assert_eq!(list["total"], 0);

    let (st, v) = req(
        &s,
        ot,
        "PUT",
        &rpath(&b),
        Some(json!({"status": "to_read"})),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    // Bob deleting does not touch the owner's state.
    req(&s, ot, "DELETE", &rpath(&b), None).await;
    let (_, mine) = get(&s, &b).await;
    assert_eq!(mine["status"], "read");
    assert_eq!(mine["rating"], 5);
    let (_, theirs) = req(&s, ot, "GET", &rpath(&b), None).await;
    assert!(theirs.is_null());
}

#[tokio::test]
async fn a_book_of_another_library_is_404() {
    let (s, _) = setup().await;
    let (lib2, _) = other_library(&s.state).await;
    let foreign = insert_book(&s.state, &lib2, "Altro").await;
    for (m, body) in [
        ("GET", None),
        ("PUT", Some(json!({"status": "read"}))),
        ("DELETE", None),
    ] {
        let (st, v) = req(&s, &s.session.access_token, m, &rpath(&foreign), body).await;
        assert_eq!(st, 404, "{m} {v}");
        assert_eq!(v["error_code"], "not_found");
    }
    let (st, _) = get(&s, "no-such-book").await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn a_guest_writes_their_own_state() {
    let (s, b) = setup().await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let gt = guest.access_token.as_str();
    let (st, v) = req(
        &s,
        gt,
        "PUT",
        &rpath(&b),
        Some(json!({"status": "reading"})),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    let (_, g) = req(&s, gt, "GET", &rpath(&b), None).await;
    assert_eq!(g["status"], "reading");
    let (st, _) = req(&s, gt, "DELETE", &rpath(&b), None).await;
    assert_eq!(st, 204);
}

#[tokio::test]
async fn needs_a_token() {
    let (s, b) = setup().await;
    for (m, p) in [
        ("GET", rpath(&b)),
        ("PUT", rpath(&b)),
        ("DELETE", rpath(&b)),
        ("GET", "/api/v1/reading".to_string()),
    ] {
        let (st, _, _) = call(&s.state, m, &p, None, Some(json!({"status": "read"}))).await;
        assert_eq!(st, 401, "{m} {p}");
    }
}

#[tokio::test]
async fn list_filters_orders_and_paginates() {
    let s = seed(Role::Owner, None, None).await;
    let mut ids = vec![];
    for (i, status) in ["read", "reading", "read", "to_read"]
        .into_iter()
        .enumerate()
    {
        let b = insert_book(&s.state, &s.library_id, &format!("Libro {i}")).await;
        put(&s, &b, json!({"status": status})).await;
        let (bb, t) = (b.clone(), 1000 + i as i64);
        s.state
            .db
            .run(move |c| {
                c.execute(
                    "UPDATE reading SET updated_at = ?1 WHERE book_id = ?2",
                    rusqlite::params![t, bb],
                )
            })
            .await
            .unwrap();
        ids.push(b);
    }
    // A book without state never shows.
    insert_book(&s.state, &s.library_id, "Senza stato").await;
    set_pages(&s, &ids[3], 321).await;

    let tok = &s.session.access_token;
    let (st, all) = req(&s, tok, "GET", "/api/v1/reading", None).await;
    assert_eq!(st, 200, "{all}");
    assert_eq!(all["total"], 4);
    let order: Vec<&str> = all["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["book_id"].as_str().unwrap())
        .collect();
    assert_eq!(
        order,
        vec![
            ids[3].as_str(),
            ids[2].as_str(),
            ids[1].as_str(),
            ids[0].as_str()
        ]
    );
    let first = &all["items"][0];
    assert_eq!(first["status"], "to_read");
    assert_eq!(first["book"]["id"], ids[3]);
    assert_eq!(first["book"]["title"], "Libro 3");
    assert_eq!(first["book"]["page_count"], 321);
    assert!(first["book"]["authors"].is_array());
    assert!(first["book"]
        .as_object()
        .unwrap()
        .contains_key("cover_color"));

    let (_, read) = req(&s, tok, "GET", "/api/v1/reading?status=read", None).await;
    assert_eq!(read["total"], 2);
    assert_eq!(read["items"].as_array().unwrap().len(), 2);

    let (_, page) = req(&s, tok, "GET", "/api/v1/reading?limit=1&offset=1", None).await;
    assert_eq!(page["total"], 4);
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(page["items"][0]["book_id"], ids[2]);

    for q in ["status=nope", "limit=0", "limit=201", "offset=-1"] {
        let (st, v) = req(&s, tok, "GET", &format!("/api/v1/reading?{q}"), None).await;
        assert_eq!(st, 422, "{q} {v}");
    }
}

#[tokio::test]
async fn deleting_the_book_deletes_the_state() {
    let (s, b) = setup().await;
    put(&s, &b, json!({"status": "read"})).await;
    let (st, _) = req(
        &s,
        &s.session.access_token,
        "DELETE",
        &format!("/api/v1/books/{b}"),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let n: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM reading", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn put_and_delete_are_audited_without_the_note() {
    let (s, b) = setup().await;
    put(&s, &b, json!({"status": "reading", "note": "segreto"})).await;
    req(&s, &s.session.access_token, "DELETE", &rpath(&b), None).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let mine: Vec<_> = rows.iter().filter(|r| r.1 == "reading").collect();
    assert_eq!(mine.len(), 2, "{rows:?}");
    assert!(mine.iter().all(|r| r.2 == b));
    let details: String = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT COALESCE(group_concat(detail_json), '') FROM audit_log WHERE entity_type = 'reading'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert!(!details.contains("segreto"), "{details}");
}
