mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

const URL: &str = "/api/v1/books/isbn-index";

async fn index(s: &Seeded, token: &str, version: Option<&str>) -> Value {
    let url = match version {
        Some(v) => format!("{URL}?version={v}"),
        None => URL.to_string(),
    };
    let (st, _, b) = call(&s.state, "GET", &url, Some(token), None).await;
    assert_eq!(st, 200, "{b}");
    b
}

async fn idx(s: &Seeded) -> Value {
    index(s, &s.session.access_token, None).await
}

async fn create(s: &Seeded, body: Value) -> String {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(&s.session.access_token),
        Some(body),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    b["id"].as_str().unwrap().to_string()
}

async fn place(s: &Seeded, book: &str, shelf: &str, row: i64, slot: i64) {
    let (st, _, b) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book}/placement"),
        Some(&s.session.access_token),
        Some(json!({"shelf_id": shelf, "row_index": row, "slot_index": slot})),
    )
    .await;
    assert!(st == 200 || st == 201, "{st} {b}");
}

#[tokio::test]
async fn entries_and_order() {
    let s = seed(Role::Owner, None, None).await;
    // 9788804668244 is a valid ISBN-13; 0306406152 a valid ISBN-10 (-> 9780306406157).
    create(
        &s,
        json!({"title": "Zeta", "isbn_13": "9788804668244", "authors": ["A"]}),
    )
    .await;
    create(&s, json!({"title": "Alfa", "isbn_13": "9788804668244"})).await;
    create(&s, json!({"title": "Dieci", "isbn_10": "0306406152"})).await;
    create(&s, json!({"title": "Senza"})).await;
    let b = idx(&s).await;
    assert_eq!(b["unchanged"], false);
    let items = b["items"].as_array().unwrap();
    let got: Vec<(&str, &str)> = items
        .iter()
        .map(|i| (i["isbn"].as_str().unwrap(), i["title"].as_str().unwrap()))
        .collect();
    assert_eq!(
        got,
        vec![
            ("9780306406157", "Dieci"),
            ("9788804668244", "Alfa"),
            ("9788804668244", "Zeta")
        ]
    );
    assert_eq!(items[2]["authors"], json!(["A"]));
    assert!(items[0]["shelf"].is_null());
    assert!(items[0]["row_index"].is_null());
    assert!(items[0]["slot_index"].is_null());
}

#[tokio::test]
async fn placement_and_version_changes() {
    let s = seed(Role::Owner, None, None).await;
    let a = create(&s, json!({"title": "A", "isbn_13": "9788804668244"})).await;
    let shelf = insert_shelf(&s.state, &s.library_id, "Salotto", 3, 10).await;
    let v0 = idx(&s).await["version"].as_str().unwrap().to_string();
    assert_eq!(idx(&s).await["version"], v0.as_str());

    let same = index(&s, &s.session.access_token, Some(&v0)).await;
    assert_eq!(same["unchanged"], true);
    assert_eq!(same["items"], json!([]));
    assert_eq!(same["version"], v0.as_str());
    let stale = index(&s, &s.session.access_token, Some("old")).await;
    assert_eq!(stale["unchanged"], false);
    assert_eq!(stale["items"].as_array().unwrap().len(), 1);

    let mut seen = vec![v0.clone()];
    async fn bump(s: &Seeded, seen: &mut Vec<String>) {
        let v = idx(s).await["version"].as_str().unwrap().to_string();
        assert!(!seen.contains(&v), "version did not change");
        seen.push(v);
    }

    place(&s, &a, &shelf, 1, 2).await;
    let b = idx(&s).await;
    assert_eq!(
        b["items"][0]["shelf"],
        json!({"id": shelf, "name": "Salotto"})
    );
    assert_eq!(b["items"][0]["row_index"], 1);
    assert_eq!(b["items"][0]["slot_index"], 2);
    bump(&s, &mut seen).await;

    let (st, _, r) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/shelves/{shelf}"),
        Some(&s.session.access_token),
        Some(json!({"name": "Studio"})),
    )
    .await;
    assert_eq!(st, 200, "{r}");
    assert_eq!(idx(&s).await["items"][0]["shelf"]["name"], "Studio");
    bump(&s, &mut seen).await;

    let (st, _, r) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/books/{a}"),
        Some(&s.session.access_token),
        Some(json!({"title": "A2"})),
    )
    .await;
    assert_eq!(st, 200, "{r}");
    bump(&s, &mut seen).await;

    let b2 = create(&s, json!({"title": "B", "isbn_13": "9780306406157"})).await;
    bump(&s, &mut seen).await;

    let (st, _, r) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{b2}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert!(st == 200 || st == 204, "{st} {r}");
    // Back to the data before the new book: same version, and not the one with it.
    let v = idx(&s).await["version"].as_str().unwrap().to_string();
    assert_eq!(v, seen[seen.len() - 2]);
    assert_ne!(v, seen[seen.len() - 1]);
}

#[tokio::test]
async fn every_role_reads() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "A", "isbn_13": "9788804668244"})).await;
    for (role, name) in [
        (Role::Admin, "Ada"),
        (Role::Member, "Max"),
        (Role::Guest, "Gus"),
    ] {
        let (_, sess) = add_user(&s.state, &s.library_id, role, name).await;
        let b = index(&s, &sess.access_token, None).await;
        assert_eq!(b["items"].as_array().unwrap().len(), 1);
    }
    let (st, _, _) = call(&s.state, "GET", URL, None, None).await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn libraries_are_isolated() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Mio", "isbn_13": "9788804668244"})).await;
    let (_, other) = other_library(&s.state).await;
    let b = index(&s, &other.access_token, None).await;
    assert_eq!(b["items"], json!([]));
}

#[tokio::test]
async fn two_thousand_books() {
    let s = seed(Role::Owner, None, None).await;
    let lib = s.library_id.clone();
    s.state
        .db
        .run(move |c| {
            let tx = c.transaction()?;
            for i in 0..2000 {
                let body = format!("978{:09}", i);
                let sum: u32 = body
                    .bytes()
                    .enumerate()
                    .map(|(i, b)| u32::from(b - b'0') * if i % 2 == 0 { 1 } else { 3 })
                    .sum();
                let isbn = format!("{body}{}", (10 - sum % 10) % 10);
                tx.execute(
                    "INSERT INTO books (id, library_id, isbn_13, title, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, 0, 0)",
                    rusqlite::params![format!("b{i}"), lib, isbn, format!("T{i}")],
                )?;
            }
            tx.commit()
        })
        .await
        .unwrap();
    let b = idx(&s).await;
    assert_eq!(b["items"].as_array().unwrap().len(), 2000);
}
