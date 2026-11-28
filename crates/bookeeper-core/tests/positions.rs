mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

struct Ctx {
    s: Seeded,
    book: String,
    file: String,
}

async fn setup(pages: Option<i64>) -> Ctx {
    let s = seed(Role::Member, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let file = uuid::Uuid::now_v7().to_string();
    let (lib, b, f, u) = (
        s.library_id.clone(),
        book.clone(),
        file.clone(),
        s.user_id.clone(),
    );
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET page_count = ?1 WHERE id = ?2",
                rusqlite::params![pages, b],
            )?;
            c.execute(
                "INSERT INTO book_files (id, library_id, book_id, format, sha256, size_bytes, \
                 original_name, koreader_hash, uploaded_by, created_at) \
                 VALUES (?1, ?2, ?3, 'epub', 'abc', 1, 'a.epub', 'h', ?4, 1)",
                rusqlite::params![f, lib, b, u],
            )
        })
        .await
        .unwrap();
    Ctx { s, book, file }
}

fn ppath(c: &Ctx) -> String {
    format!("/api/v1/books/{}/files/{}/position", c.book, c.file)
}

async fn put(c: &Ctx, token: &str, percent: f64) -> (u16, Value) {
    let (st, _, v) = call(
        &c.s.state,
        "PUT",
        &ppath(c),
        Some(token),
        Some(json!({"kind": "cfi", "value": "epubcfi(/6/4!/4/2)", "percent": percent})),
    )
    .await;
    (st, v)
}

#[tokio::test]
async fn a_position_sets_percent_and_page() {
    let c = setup(Some(400)).await;
    let (st, v) = put(&c, &c.s.session.access_token, 37.5).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["progress_percent"], 37.5);
    assert_eq!(v["current_page"], 150);
    assert!(v["progress_at"].as_i64().unwrap() > 0);
}

#[tokio::test]
async fn a_position_creates_the_reading() {
    let c = setup(None).await;
    let (st, v) = put(&c, &c.s.session.access_token, 10.0).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["status"], "reading");
    assert!(v["started_at"].as_i64().unwrap() > 0);
    assert!(v["current_page"].is_null());
    // Zero percent creates nothing.
    let c = setup(None).await;
    let (st, v) = put(&c, &c.s.session.access_token, 0.0).await;
    assert_eq!(st, 200, "{v}");
    let (_, _, r) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/reading", c.book),
        Some(&c.s.session.access_token),
        None,
    )
    .await;
    assert!(r.is_null(), "{r}");
}

#[tokio::test]
async fn one_hundred_percent_does_not_mark_read() {
    let c = setup(Some(200)).await;
    let (st, v) = put(&c, &c.s.session.access_token, 100.0).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["status"], "reading");
    assert_eq!(v["progress_percent"], 100.0);
    assert_eq!(v["current_page"], 200);
    assert!(v["finished_at"].is_null());
}

#[tokio::test]
async fn get_lists_positions_with_the_device_name() {
    let c = setup(None).await;
    let token = &c.s.session.access_token;
    put(&c, token, 20.0).await;
    put(&c, token, 25.0).await; // last write wins, one row
    let (st, _, v) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/positions", c.book),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{v}");
    let a = v.as_array().unwrap();
    assert_eq!(a.len(), 1, "{v}");
    assert_eq!(a[0]["file_id"], c.file);
    assert_eq!(a[0]["kind"], "cfi");
    assert_eq!(a[0]["value"], "epubcfi(/6/4!/4/2)");
    assert_eq!(a[0]["percent"], 25.0);
    assert_eq!(a[0]["device_name"], "Desktop");
    assert!(a[0]["device_id"].is_string() && a[0]["updated_at"].is_i64());
}

#[tokio::test]
async fn other_people_do_not_see_my_positions() {
    let c = setup(None).await;
    put(&c, &c.s.session.access_token, 20.0).await;
    let (_, other) = add_user(&c.s.state, &c.s.library_id, Role::Member, "Bea").await;
    let (st, _, v) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/positions", c.book),
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!((st, v), (200, json!([])));
}

#[tokio::test]
async fn guests_get_403_and_bad_input_is_rejected() {
    let c = setup(None).await;
    let (_, guest) = add_user(&c.s.state, &c.s.library_id, Role::Guest, "Ospite").await;
    let (st, _) = put(&c, &guest.access_token, 10.0).await;
    assert_eq!(st, 403);
    let (st, _, _) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/positions", c.book),
        Some(&guest.access_token),
        None,
    )
    .await;
    assert_eq!(st, 403);
    let token = &c.s.session.access_token;
    assert_eq!(put(&c, token, 101.0).await.0, 422);
    assert_eq!(put(&c, token, -1.0).await.0, 422);
    let bad = format!("/api/v1/books/{}/files/nope/position", c.book);
    let (st, _, _) = call(
        &c.s.state,
        "PUT",
        &bad,
        Some(token),
        Some(json!({"kind": "cfi", "value": "x", "percent": 1})),
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn editing_a_note_keeps_the_progress_and_clearing_the_page_clears_it() {
    let c = setup(Some(10)).await;
    let tok = c.s.session.access_token.clone();
    let (_, v) = put(&c, &tok, 34.0).await;
    assert_eq!(v["current_page"], 3);
    let at = v["progress_at"].clone();
    let rpath = format!("/api/v1/books/{}/reading", c.book);
    // The apps resend the saved page with every edit.
    let (st, _, v) = call(
        &c.s.state,
        "PUT",
        &rpath,
        Some(&tok),
        Some(json!({"status": "reading", "current_page": 3, "note": "x"})),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["progress_percent"], 34.0);
    assert_eq!(v["progress_at"], at);
    // Back to to_read drops the page and the progress.
    let (st, _, v) = call(
        &c.s.state,
        "PUT",
        &rpath,
        Some(&tok),
        Some(json!({"status": "to_read"})),
    )
    .await;
    assert_eq!(st, 200, "{v}");
    assert!(v["progress_percent"].is_null(), "{v}");
    assert!(v["progress_at"].is_null(), "{v}");
}

async fn first_position(c: &Ctx) -> Value {
    let (st, _, v) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/positions", c.book),
        Some(&c.s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{v}");
    v[0].clone()
}

#[tokio::test]
async fn positions_name_the_device_kind() {
    let c = setup(None).await;
    put(&c, &c.s.session.access_token, 20.0).await;
    assert_eq!(first_position(&c).await["device_kind"], "desktop");
    c.s.state
        .db
        .run(|conn| conn.execute("UPDATE devices SET kind = 'mobile'", []))
        .await
        .unwrap();
    assert_eq!(first_position(&c).await["device_kind"], "mobile");
}

#[tokio::test]
async fn a_removed_device_has_no_kind() {
    let c = setup(None).await;
    put(&c, &c.s.session.access_token, 20.0).await;
    c.s.state
        .db
        .run(|conn| {
            // The caller keeps its session; the position points at a device that is gone.
            conn.execute("UPDATE reading_positions SET device_id = 'gone'", [])
        })
        .await
        .unwrap();
    let p = first_position(&c).await;
    assert!(p["device_kind"].is_null(), "{p}");
    assert!(p.as_object().unwrap().contains_key("device_kind"));
}
