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

#[tokio::test]
async fn to_read_clears_the_progress_with_or_without_pages() {
    let s = seed(Role::Owner, None, None).await;
    let token = &s.session.access_token;
    for pages in [Some(400), None] {
        let b = insert_book(&s.state, &s.library_id, "Dune").await;
        if let Some(p) = pages {
            set_pages(&s, &b, p).await;
        }
        let path = format!("/api/v1/books/{b}/reading");
        call(
            &s.state,
            "PUT",
            &path,
            Some(token),
            Some(json!({"status": "reading", "current_page": 100})),
        )
        .await;
        // A saved position, as a reader app sends it.
        s.state
            .db
            .run({
                let b = b.clone();
                move |c| {
                    c.execute(
                        "UPDATE reading SET progress_percent = 25.0, progress_at = 5, \
                         progress_device_id = 'd' WHERE book_id = ?1",
                        [b],
                    )
                }
            })
            .await
            .unwrap();
        let (st, _, v) = call(
            &s.state,
            "PUT",
            &path,
            Some(token),
            Some(json!({"status": "to_read"})),
        )
        .await;
        assert_eq!(st, 200, "{v}");
        assert!(
            v["progress_percent"].is_null() && v["progress_at"].is_null(),
            "{v}"
        );
        let (b2, d2): (Option<String>, Option<String>) = s
            .state
            .db
            .run(move |c| {
                c.query_row(
                    "SELECT progress_at, progress_device_id FROM reading WHERE book_id = ?1",
                    [b],
                    |r| {
                        Ok((
                            r.get::<_, Option<i64>>(0)?.map(|n| n.to_string()),
                            r.get(1)?,
                        ))
                    },
                )
            })
            .await
            .unwrap();
        assert!(b2.is_none() && d2.is_none());
    }
}

#[tokio::test]
async fn the_book_list_reports_the_saved_progress() {
    let s = seed(Role::Owner, None, None).await;
    let b = insert_book(&s.state, &s.library_id, "Dune").await;
    set_pages(&s, &b, 400).await;
    let token = &s.session.access_token;
    call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{b}/reading"),
        Some(token),
        Some(json!({"status": "reading", "current_page": 100})),
    )
    .await;
    let (st, _, v) = call(&s.state, "GET", "/api/v1/books", Some(token), None).await;
    assert_eq!(st, 200, "{v}");
    let item = &v["items"][0];
    assert_eq!(item["reading"]["progress_percent"], 25.0, "{v}");
}
