mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::json;

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

#[tokio::test]
async fn a_handwritten_page_gives_the_percentage() {
    let s = seed(Role::Owner, None, None).await;
    let b = insert_book(&s.state, &s.library_id, "Dune").await;
    set_pages(&s, &b, 400).await;
    let token = &s.session.access_token;
    let path = format!("/api/v1/books/{b}/reading");
    let (st, _, v) = call(
        &s.state,
        "PUT",
        &path,
        Some(token),
        Some(json!({"status": "reading", "current_page": 133})),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["progress_percent"], 33.3);
    assert!(v["progress_at"].as_i64().unwrap() > 0);
    let (_, _, v) = call(&s.state, "GET", &path, Some(token), None).await;
    assert_eq!(v["progress_percent"], 33.3);
}

#[tokio::test]
async fn without_page_count_or_page_there_is_no_progress() {
    let s = seed(Role::Owner, None, None).await;
    let b = insert_book(&s.state, &s.library_id, "Dune").await;
    let token = &s.session.access_token;
    let path = format!("/api/v1/books/{b}/reading");
    let (_, _, v) = call(
        &s.state,
        "PUT",
        &path,
        Some(token),
        Some(json!({"status": "reading", "current_page": 10})),
    )
    .await;
    assert!(v["progress_percent"].is_null() && v["progress_at"].is_null());
}
