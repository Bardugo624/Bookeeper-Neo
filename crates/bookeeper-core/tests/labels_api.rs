mod common;

use axum::{body::Body, http::Request};
use bookeeper_core::auth::Role;
use bookeeper_core::labels::{datamatrix_bitmap, label_code, render_pdf, Label};
use bookeeper_core::router;
use common::*;
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

fn label(p: i64, title: &str) -> Label {
    Label {
        progressive: p,
        title: title.into(),
        authors: "A. Autore".into(),
        shelf_name: Some("Soggiorno".into()),
        shelf_code: 12,
        row: 3,
        slot: 7,
    }
}

fn count(hay: &[u8], needle: &[u8]) -> usize {
    hay.windows(needle.len()).filter(|w| *w == needle).count()
}

fn pages(pdf: &[u8]) -> usize {
    count(pdf, b"/Type /Page ") + count(pdf, b"/Type /Page>") + count(pdf, b"/Type /Page/")
}

#[test]
fn label_code_layout() {
    assert_eq!(label_code(&label(42, "x")), "004207030012");
}

#[test]
fn label_code_for_unplaced_books() {
    let mut l = label(42, "x");
    l.shelf_name = None;
    l.row = 0;
    l.slot = 0;
    l.shelf_code = 0;
    assert_eq!(label_code(&l), "004200000000");
}

#[test]
fn label_code_wraps_oversized_values() {
    let mut l = label(12345, "x");
    l.slot = 123;
    l.row = 456;
    l.shelf_code = 98765;
    let c = label_code(&l);
    assert!(c.starts_with("2345"), "{c}");
    assert_eq!(c.len(), 12);
    assert!(c.bytes().all(|b| b.is_ascii_digit()));
}

#[test]
fn datamatrix_round_trips() {
    for code in ["004207030012", "000100000000", "999999999999"] {
        let (bits, side) = datamatrix_bitmap(code).unwrap();
        assert_eq!(bits.len(), side * side);
        let decoded = datamatrix::DataMatrix::decode(&bits, side).unwrap();
        assert_eq!(decoded, code.as_bytes());
    }
    let a = datamatrix_bitmap("004207030012").unwrap();
    let b = datamatrix_bitmap("004207030013").unwrap();
    assert_ne!(a.0, b.0);
}

#[test]
fn pdf_starts_with_the_magic_bytes_and_is_deterministic() {
    let ls = vec![label(1, "Dune"), label(2, "Il nome della rosa")];
    let a = render_pdf(&ls).unwrap();
    let b = render_pdf(&ls).unwrap();
    assert!(a.starts_with(b"%PDF-"));
    assert_eq!(a, b);
}

#[test]
fn page_count_follows_the_grid() {
    for (n, expected) in [(1, 1), (44, 1), (45, 2), (100, 3)] {
        let ls: Vec<Label> = (1..=n).map(|i| label(i, "T")).collect();
        let pdf = render_pdf(&ls).unwrap();
        assert_eq!(pages(&pdf), expected, "{n} labels");
    }
}

#[test]
fn long_and_non_latin_titles_do_not_fail() {
    let long = "Lungo ".repeat(50);
    let pdf = render_pdf(&[label(1, &long), label(2, "Война и мир 戦争と平和")]).unwrap();
    assert!(pdf.starts_with(b"%PDF-"));
    // The cut title ends with the WinAnsi ellipsis and no line is longer than the label.
    assert!(count(&pdf, b"\\205) Tj") >= 1);
    assert!(count(&pdf, b"(?????") >= 1);
}

async fn set_progressive(s: &Seeded, book: &str, n: Option<i64>) {
    let b = book.to_string();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET progressive_number = ?1 WHERE id = ?2",
                rusqlite::params![n, b],
            )
        })
        .await
        .unwrap();
}

async fn post_raw(
    s: &Seeded,
    token: Option<&str>,
    body: serde_json::Value,
) -> (u16, axum::http::HeaderMap, Vec<u8>) {
    let mut req = Request::builder()
        .method("POST")
        .uri("/api/v1/labels/pdf")
        .header("content-type", "application/json");
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let resp = router(s.state.clone())
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (status, headers, bytes)
}

async fn pdf_call(s: &Seeded, body: serde_json::Value) -> (u16, axum::http::HeaderMap, Vec<u8>) {
    post_raw(s, Some(&s.session.access_token), body).await
}

#[tokio::test]
async fn route_returns_a_pdf_with_the_skipped_count() {
    let s = seed(Role::Owner, None, None).await;
    let b1 = insert_book(&s.state, &s.library_id, "Dune").await;
    set_progressive(&s, &b1, Some(1)).await;
    let shelf = insert_shelf(&s.state, &s.library_id, "Studio", 3, 10).await;
    let (sh, bk) = (shelf, b1.clone());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at)
                 VALUES (?1, ?2, 1, 4, 0)",
                rusqlite::params![bk, sh],
            )
        })
        .await
        .unwrap();
    let (st, h, body) = pdf_call(&s, json!({"book_ids": [b1, "nope"]})).await;
    assert_eq!(st, 200);
    assert_eq!(h["content-type"], "application/pdf");
    assert_eq!(h["x-labels-skipped"], "1");
    let cd = h["content-disposition"].to_str().unwrap();
    assert!(cd.contains("etichette-") && cd.ends_with(".pdf\""), "{cd}");
    assert!(body.starts_with(b"%PDF-"));
    assert_eq!(pages(&body), 1);
    assert!(count(&body, b"(N. 1)") == 1);
    assert!(count(&body, b"M2") == 1 && count(&body, b"P5") == 1);
}

#[tokio::test]
async fn books_without_progressive_are_skipped() {
    let s = seed(Role::Owner, None, None).await;
    let a = insert_book(&s.state, &s.library_id, "A").await;
    let b = insert_book(&s.state, &s.library_id, "B").await;
    set_progressive(&s, &a, Some(5)).await;
    let (st, h, _) = pdf_call(&s, json!({"book_ids": [b, a]})).await;
    assert_eq!(st, 200);
    assert_eq!(h["x-labels-skipped"], "1");
}

#[tokio::test]
async fn other_library_books_are_skipped() {
    let s = seed(Role::Owner, None, None).await;
    let mine = insert_book(&s.state, &s.library_id, "A").await;
    set_progressive(&s, &mine, Some(1)).await;
    let (other, _) = other_library(&s.state).await;
    let foreign = insert_book(&s.state, &other, "F").await;
    set_progressive(&s, &foreign, Some(1)).await;
    let (st, h, _) = pdf_call(&s, json!({"book_ids": [foreign, mine]})).await;
    assert_eq!(st, 200);
    assert_eq!(h["x-labels-skipped"], "1");
}

#[tokio::test]
async fn duplicates_produce_one_label() {
    let s = seed(Role::Owner, None, None).await;
    let a = insert_book(&s.state, &s.library_id, "A").await;
    set_progressive(&s, &a, Some(9)).await;
    let (st, h, body) = pdf_call(&s, json!({"book_ids": [a, a, a]})).await;
    assert_eq!(st, 200);
    assert_eq!(h["x-labels-skipped"], "0");
    assert_eq!(count(&body, b"(N. 9)"), 1);
}

#[tokio::test]
async fn nothing_to_print_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let a = insert_book(&s.state, &s.library_id, "A").await;
    let (st, _, body) = pdf_call(&s, json!({"book_ids": [a, "x"]})).await;
    assert_eq!(st, 422);
    assert!(String::from_utf8_lossy(&body).contains("validation"));
}

#[tokio::test]
async fn zero_and_2001_ids_are_validation() {
    let s = seed(Role::Owner, None, None).await;
    let many: Vec<String> = (0..2001).map(|i| format!("id{i}")).collect();
    for ids in [json!([]), json!(many)] {
        let (st, _, _) = pdf_call(&s, json!({"book_ids": ids})).await;
        assert_eq!(st, 422);
    }
}

#[tokio::test]
async fn guest_can_print() {
    let s = seed(Role::Owner, None, None).await;
    let a = insert_book(&s.state, &s.library_id, "A").await;
    set_progressive(&s, &a, Some(1)).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let (st, _, body) = post_raw(&s, Some(&guest.access_token), json!({"book_ids": [a]})).await;
    assert_eq!(st, 200);
    assert!(body.starts_with(b"%PDF-"));
}

#[tokio::test]
async fn route_needs_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, _) = post_raw(&s, None, json!({"book_ids": ["a"]})).await;
    assert_eq!(st, 401);
}
