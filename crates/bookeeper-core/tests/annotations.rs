mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

const SHA: &str = "abc123";

struct Ctx {
    s: Seeded,
    book: String,
}

async fn attach(s: &Seeded, book: &str, sha: &str) {
    let (lib, b, sha) = (s.library_id.clone(), book.to_string(), sha.to_string());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO book_files (id, library_id, book_id, format, sha256, size_bytes, \
                 original_name, koreader_hash, created_at) \
                 VALUES (?1, ?2, ?3, 'epub', ?4, 1, 'a.epub', 'h', 1)",
                rusqlite::params![uuid::Uuid::now_v7().to_string(), lib, b, sha],
            )
        })
        .await
        .unwrap();
}

async fn setup() -> Ctx {
    let s = seed(Role::Member, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    attach(&s, &book, SHA).await;
    Ctx { s, book }
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn body(updated_at: i64) -> Value {
    json!({
        "file_sha256": SHA, "kind": "highlight", "cfi": "epubcfi(/6/4)", "text": "Fear is the mind-killer",
        "color": "amber", "note": null, "percent": 12.5, "chapter": "I",
        "created_at": 100, "updated_at": updated_at, "deleted": false
    })
}

fn path(book: &str, id: &str) -> String {
    format!("/api/v1/books/{book}/annotations/{id}")
}

async fn put(c: &Ctx, token: &str, id: &str, b: Value) -> (u16, Value) {
    let (st, _, v) = call(&c.s.state, "PUT", &path(&c.book, id), Some(token), Some(b)).await;
    (st, v)
}

async fn list(c: &Ctx, token: &str, q: &str) -> Vec<Value> {
    let (st, _, v) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/annotations{q}", c.book),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{v}");
    v.as_array().unwrap().clone()
}

#[tokio::test]
async fn a_highlight_is_created_and_listed() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    let (st, v) = put(&c, t, "a1", body(200)).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["id"], "a1");
    assert_eq!(v["color"], "amber");
    assert!(v["deleted_at"].is_null());
    let mut late = body(200);
    late["percent"] = json!(50.0);
    put(&c, t, "a2", late).await;
    let mut early = body(200);
    early["percent"] = json!(1.0);
    put(&c, t, "a3", early).await;
    let ids: Vec<String> = list(&c, t, "")
        .await
        .iter()
        .map(|a| a["id"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(ids, ["a3", "a1", "a2"]);
}

#[tokio::test]
async fn an_older_write_does_not_overwrite_a_newer_one() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    put(&c, t, "a1", body(200)).await;
    let mut older = body(150);
    older["text"] = json!("other");
    older["color"] = json!("sage");
    let (st, v) = put(&c, t, "a1", older).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["text"], "Fear is the mind-killer");
    assert_eq!(v["color"], "amber");
    assert_eq!(v["updated_at"], 200);
    let mut newer = body(300);
    newer["note"] = json!("hi");
    let (_, v) = put(&c, t, "a1", newer).await;
    assert_eq!(v["note"], "hi");
}

#[tokio::test]
async fn deleting_leaves_a_tombstone_for_since() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    put(&c, t, "a1", body(200)).await;
    let mut del = body(300);
    del["deleted"] = json!(true);
    let (st, v) = put(&c, t, "a1", del).await;
    assert_eq!(st, 200, "{v}");
    assert_eq!(v["deleted_at"], 300);
    assert!(list(&c, t, "").await.is_empty());
    let since = list(&c, t, "?since=250").await;
    assert_eq!(since.len(), 1);
    assert_eq!(since[0]["deleted_at"], 300);
    assert!(list(&c, t, "?since=300").await.is_empty());
}

#[tokio::test]
async fn another_person_cannot_see_or_touch_an_annotation() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    put(&c, t, "a1", body(200)).await;
    let (_, other) = add_user(&c.s.state, &c.s.library_id, Role::Member, "Bea").await;
    let o = &other.access_token;
    assert!(list(&c, o, "").await.is_empty());
    assert!(list(&c, o, "?since=0").await.is_empty());
    let (st, _) = put(&c, o, "a1", body(900)).await;
    assert_eq!(st, 404);
    let mine = list(&c, t, "").await;
    assert_eq!(mine[0]["updated_at"], 200);
}

#[tokio::test]
async fn a_highlight_needs_a_color_and_a_bookmark_has_none() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    let mut b = body(200);
    b["color"] = Value::Null;
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    let mut b = body(200);
    b["color"] = json!("pink");
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    let mut b = body(200);
    b["kind"] = json!("bookmark");
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    let mut b = body(200);
    b["kind"] = json!("bookmark");
    b["color"] = Value::Null;
    assert_eq!(put(&c, t, "a1", b).await.0, 200);
}

#[tokio::test]
async fn limits_are_enforced() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    let mut b = body(200);
    b["cfi"] = json!("x".repeat(4001));
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    let mut b = body(200);
    b["percent"] = json!(101.0);
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    assert_eq!(put(&c, t, "a1", body(now() + 600)).await.0, 422);
    let mut b = body(200);
    b["note"] = json!("x".repeat(10_001));
    assert_eq!(put(&c, t, "a1", b).await.0, 422);
    assert_eq!(put(&c, t, "a1", body(200)).await.0, 200);
}

#[tokio::test]
async fn the_file_must_belong_to_the_book() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    let other = insert_book(&c.s.state, &c.s.library_id, "Emma").await;
    attach(&c.s, &other, "zzz").await;
    let mut b = body(200);
    b["file_sha256"] = json!("zzz");
    assert_eq!(put(&c, t, "a1", b).await.0, 404);
}

#[tokio::test]
async fn guests_get_403() {
    let c = setup().await;
    let (_, guest) = add_user(&c.s.state, &c.s.library_id, Role::Guest, "Ospite").await;
    let g = &guest.access_token;
    assert_eq!(put(&c, g, "a1", body(200)).await.0, 403);
    let (st, _, _) = call(
        &c.s.state,
        "GET",
        &format!("/api/v1/books/{}/annotations", c.book),
        Some(g),
        None,
    )
    .await;
    assert_eq!(st, 403);
}

#[tokio::test]
async fn deleting_the_book_deletes_its_annotations() {
    let c = setup().await;
    let t = &c.s.session.access_token;
    put(&c, t, "a1", body(200)).await;
    let (st, _, v) = call(
        &c.s.state,
        "DELETE",
        &format!("/api/v1/books/{}", c.book),
        Some(t),
        None,
    )
    .await;
    assert!(st == 200 || st == 204, "{st} {v}");
    let n: i64 =
        c.s.state
            .db
            .run(|conn| conn.query_row("SELECT count(*) FROM annotations", [], |r| r.get(0)))
            .await
            .unwrap();
    assert_eq!(n, 0);
}
