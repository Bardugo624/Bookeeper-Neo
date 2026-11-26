mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

async fn post_loan(s: &Seeded, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/loans",
        Some(&s.session.access_token),
        Some(body),
    )
    .await;
    (st, b)
}

async fn req(s: &Seeded, method: &str, path: &str, body: Option<Value>) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(&s.session.access_token), body).await;
    (st, b)
}

async fn lend(s: &Seeded, book: &str, extra: Value) -> Value {
    let mut body = json!({"book_id": book, "borrower_name": "Marta"});
    for (k, v) in extra.as_object().unwrap() {
        body[k] = v.clone();
    }
    let (st, b) = post_loan(s, body).await;
    assert_eq!(st, 201, "{b}");
    b
}

async fn set_authors(s: &Seeded, book: &str, authors: &str) {
    let (b, a) = (book.to_string(), authors.to_string());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET authors_json = ?1 WHERE id = ?2",
                rusqlite::params![a, b],
            )
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn create_defaults_lent_at_to_now() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    set_authors(&s, &book, r#"["Frank Herbert"]"#).await;
    let before = now();
    let l = lend(&s, &book, json!({})).await;
    assert!(l["lent_at"].as_i64().unwrap() >= before);
    assert_eq!(l["book_title"], "Dune");
    assert_eq!(l["book_authors"], json!(["Frank Herbert"]));
    assert_eq!(l["returned_at"], Value::Null);
    assert_eq!(l["overdue"], false);
    assert_eq!(l["borrower_user_id"], Value::Null);
    assert_eq!(l["due_at"], Value::Null);
}

#[tokio::test]
async fn book_must_exist_in_this_library() {
    let s = seed(Role::Owner, None, None).await;
    let (other_lib, _) = other_library(&s.state).await;
    let foreign = insert_book(&s.state, &other_lib, "Altro").await;
    for id in ["nope".to_string(), foreign] {
        let (st, b) = post_loan(&s, json!({"book_id": id, "borrower_name": "M"})).await;
        assert_eq!(st, 404);
        assert_eq!(b["error_code"], "not_found");
    }
}

#[tokio::test]
async fn second_open_loan_is_conflict() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let (st, b) = post_loan(&s, json!({"book_id": book, "borrower_name": "X"})).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (409, Some("book_already_lent"))
    );
    let (st, _) = req(
        &s,
        "POST",
        &format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap()),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 200);
    let (st, _) = post_loan(&s, json!({"book_id": book, "borrower_name": "X"})).await;
    assert_eq!(st, 201);
}

#[tokio::test]
async fn concurrent_loans_one_wins() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (a, b) = tokio::join!(
        post_loan(&s, json!({"book_id": book, "borrower_name": "A"})),
        post_loan(&s, json!({"book_id": book, "borrower_name": "B"})),
    );
    let mut codes = [a.0, b.0];
    codes.sort_unstable();
    assert_eq!(codes, [201, 409]);
}

#[tokio::test]
async fn validation_table() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let long = "a".repeat(121);
    let cases = [
        json!({"book_id": book, "borrower_name": ""}),
        json!({"book_id": book, "borrower_name": "   "}),
        json!({"book_id": book, "borrower_name": long}),
        json!({"book_id": book, "borrower_name": "M", "lent_at": 1000, "due_at": 999}),
    ];
    for c in cases {
        let (st, b) = post_loan(&s, c.clone()).await;
        assert_eq!(st, 422, "{c}");
        assert_eq!(b["error_code"], "validation");
    }
    let (st, _) = post_loan(
        &s,
        json!({"book_id": book, "borrower_name": "a".repeat(120)}),
    )
    .await;
    assert_eq!(st, 201);
}

async fn three_loans(s: &Seeded) -> (String, String, String) {
    let t = now();
    let b1 = insert_book(&s.state, &s.library_id, "Aperto").await;
    let b2 = insert_book(&s.state, &s.library_id, "Scaduto").await;
    let b3 = insert_book(&s.state, &s.library_id, "Reso").await;
    lend(s, &b1, json!({"lent_at": t - 100, "due_at": t + 86400})).await;
    lend(s, &b2, json!({"lent_at": t - 1000, "due_at": t - 500})).await;
    let l3 = lend(s, &b3, json!({"lent_at": t - 1000})).await;
    let (st, _) = req(
        s,
        "POST",
        &format!("/api/v1/loans/{}/return", l3["id"].as_str().unwrap()),
        Some(json!({})),
    )
    .await;
    assert_eq!(st, 200);
    (b1, b2, b3)
}

#[tokio::test]
async fn list_defaults_to_active() {
    let s = seed(Role::Owner, None, None).await;
    three_loans(&s).await;
    let (st, b) = req(&s, "GET", "/api/v1/loans", None).await;
    assert_eq!(st, 200);
    assert_eq!(b["total"], 2);
    assert_eq!(b["items"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn list_by_status() {
    let s = seed(Role::Owner, None, None).await;
    three_loans(&s).await;
    for (status, n) in [("active", 2), ("overdue", 1), ("returned", 1), ("all", 3)] {
        let (st, b) = req(&s, "GET", &format!("/api/v1/loans?status={status}"), None).await;
        assert_eq!(st, 200);
        assert_eq!(b["total"], n, "{status}");
        assert_eq!(b["items"].as_array().unwrap().len(), n as usize, "{status}");
    }
    let (st, b) = req(&s, "GET", "/api/v1/loans?status=foo", None).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
    let (st, b) = req(&s, "GET", "/api/v1/loans?status=all&limit=2&offset=2", None).await;
    assert_eq!(st, 200);
    assert_eq!(
        (b["total"].as_i64(), b["items"].as_array().unwrap().len()),
        (Some(3), 1)
    );
}

#[tokio::test]
async fn list_by_book_id_gives_its_history() {
    let s = seed(Role::Owner, None, None).await;
    let (b1, _, _) = three_loans(&s).await;
    let l = lend(
        &s,
        &insert_book(&s.state, &s.library_id, "X").await,
        json!({}),
    )
    .await;
    let x = l["book_id"].as_str().unwrap().to_string();
    let (_, r) = req(
        &s,
        "POST",
        &format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap()),
        Some(json!({})),
    )
    .await;
    assert!(r["returned_at"].is_i64());
    lend(&s, &x, json!({})).await;
    let (_, b) = req(
        &s,
        "GET",
        &format!("/api/v1/loans?status=all&book_id={x}"),
        None,
    )
    .await;
    assert_eq!(b["total"], 2);
    let (_, b) = req(
        &s,
        "GET",
        &format!("/api/v1/loans?status=all&book_id={b1}"),
        None,
    )
    .await;
    assert_eq!(b["total"], 1);
}

#[tokio::test]
async fn active_loans_are_ordered_by_due_date_with_open_ended_last() {
    let s = seed(Role::Owner, None, None).await;
    let t = now();
    let mut ids = vec![];
    for (title, lent, due) in [
        ("nodue-old", t - 300, None),
        ("late", t - 10, Some(t + 2000)),
        ("nodue-new", t - 100, None),
        ("soon", t - 10, Some(t + 1000)),
    ] {
        let b = insert_book(&s.state, &s.library_id, title).await;
        let extra = match due {
            Some(d) => json!({"lent_at": lent, "due_at": d}),
            None => json!({"lent_at": lent}),
        };
        lend(&s, &b, extra).await;
        ids.push(title);
    }
    let (_, b) = req(&s, "GET", "/api/v1/loans", None).await;
    let titles: Vec<&str> = b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["book_title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, ["soon", "late", "nodue-new", "nodue-old"]);
}

#[tokio::test]
async fn overdue_flag() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(
        &s,
        &book,
        json!({"lent_at": now() - 1000, "due_at": now() - 10}),
    )
    .await;
    assert_eq!(l["overdue"], true);
    let (_, r) = req(
        &s,
        "POST",
        &format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap()),
        Some(json!({})),
    )
    .await;
    assert_eq!(r["overdue"], false);
}

#[tokio::test]
async fn patch_changes_and_clears() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let t = now();
    let l = lend(
        &s,
        &book,
        json!({"lent_at": t - 100, "due_at": t + 100, "notes": "ciao"}),
    )
    .await;
    let path = format!("/api/v1/loans/{}", l["id"].as_str().unwrap());
    let (st, b) = req(
        &s,
        "PATCH",
        &path,
        Some(json!({"borrower_name": " Luca ", "notes": null, "due_at": null})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["borrower_name"], "Luca");
    assert_eq!(b["notes"], Value::Null);
    assert_eq!(b["due_at"], Value::Null);
    assert_eq!(b["lent_at"], t - 100);
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"book_id": book}))).await;
    assert_eq!(st, 422);
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"borrower_name": null}))).await;
    assert_eq!(st, 422);
    let (st, _) = req(&s, "PATCH", &path, Some(json!({"due_at": t - 500}))).await;
    assert_eq!(st, 422);
    let (st, _) = req(&s, "PATCH", "/api/v1/loans/nope", Some(json!({}))).await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn return_sets_the_date_once() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let t = now();
    let l = lend(&s, &book, json!({"lent_at": t - 1000})).await;
    let path = format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap());
    let (st, b) = req(&s, "POST", &path, Some(json!({"returned_at": t - 500}))).await;
    assert_eq!((st, b["returned_at"].as_i64()), (200, Some(t - 500)));
    let (st, b) = req(&s, "POST", &path, Some(json!({"returned_at": t - 100}))).await;
    assert_eq!((st, b["returned_at"].as_i64()), (200, Some(t - 500)));
}

#[tokio::test]
async fn return_before_lent_at_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let t = now();
    let l = lend(&s, &book, json!({"lent_at": t - 100})).await;
    let path = format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap());
    let (st, b) = req(&s, "POST", &path, Some(json!({"returned_at": t - 200}))).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn reopen_clears_the_date() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let id = l["id"].as_str().unwrap();
    let (st, b) = req(&s, "POST", &format!("/api/v1/loans/{id}/reopen"), None).await;
    assert_eq!((st, b["returned_at"].clone()), (200, Value::Null));
    req(
        &s,
        "POST",
        &format!("/api/v1/loans/{id}/return"),
        Some(json!({})),
    )
    .await;
    let (st, b) = req(&s, "POST", &format!("/api/v1/loans/{id}/reopen"), None).await;
    assert_eq!((st, b["returned_at"].clone()), (200, Value::Null));
}

#[tokio::test]
async fn reopen_conflicts_when_the_book_is_lent_again() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let id = l["id"].as_str().unwrap();
    req(
        &s,
        "POST",
        &format!("/api/v1/loans/{id}/return"),
        Some(json!({})),
    )
    .await;
    lend(&s, &book, json!({})).await;
    let (st, b) = req(&s, "POST", &format!("/api/v1/loans/{id}/reopen"), None).await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (409, Some("book_already_lent"))
    );
}

#[tokio::test]
async fn delete_removes_the_loan() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let path = format!("/api/v1/loans/{}", l["id"].as_str().unwrap());
    assert_eq!(req(&s, "DELETE", &path, None).await.0, 204);
    assert_eq!(req(&s, "DELETE", &path, None).await.0, 404);
    let (_, b) = req(&s, "GET", "/api/v1/loans?status=all", None).await;
    assert_eq!(b["total"], 0);
}

#[tokio::test]
async fn deleting_the_book_removes_its_loans() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    lend(&s, &book, json!({})).await;
    let b = book.clone();
    s.state
        .db
        .run(move |c| c.execute("DELETE FROM books WHERE id = ?1", [b]))
        .await
        .unwrap();
    let (_, b) = req(&s, "GET", "/api/v1/loans?status=all", None).await;
    assert_eq!(b["total"], 0);
}

#[tokio::test]
async fn other_library_gets_not_found() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = other_library(&s.state).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let id = l["id"].as_str().unwrap();
    let tok = Some(other.access_token.as_str());
    for (m, p, body) in [
        (
            "PATCH",
            format!("/api/v1/loans/{id}"),
            Some(json!({"notes": "x"})),
        ),
        ("DELETE", format!("/api/v1/loans/{id}"), None),
        (
            "POST",
            format!("/api/v1/loans/{id}/return"),
            Some(json!({})),
        ),
        ("POST", format!("/api/v1/loans/{id}/reopen"), None),
    ] {
        let (st, _, _) = call(&s.state, m, &p, tok, body).await;
        assert_eq!(st, 404, "{m} {p}");
    }
    let (_, _, b) = call(&s.state, "GET", "/api/v1/loans?status=all", tok, None).await;
    assert_eq!(b["total"], 0);
}

#[tokio::test]
async fn guest_can_read_but_not_write() {
    let s = seed(Role::Owner, None, None).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let id = l["id"].as_str().unwrap();
    let tok = Some(guest.access_token.as_str());
    let (st, _, _) = call(&s.state, "GET", "/api/v1/loans", tok, None).await;
    assert_eq!(st, 200);
    for (m, p, body) in [
        (
            "POST",
            "/api/v1/loans".to_string(),
            Some(json!({"book_id": book, "borrower_name": "x"})),
        ),
        ("PATCH", format!("/api/v1/loans/{id}"), Some(json!({}))),
        ("DELETE", format!("/api/v1/loans/{id}"), None),
        (
            "POST",
            format!("/api/v1/loans/{id}/return"),
            Some(json!({})),
        ),
        ("POST", format!("/api/v1/loans/{id}/reopen"), None),
    ] {
        let (st, _, b) = call(&s.state, m, &p, tok, body).await;
        assert_eq!(
            (st, b["error_code"].as_str()),
            (403, Some("forbidden")),
            "{m} {p}"
        );
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    for (m, p) in [
        ("GET", "/api/v1/loans"),
        ("POST", "/api/v1/loans"),
        ("PATCH", "/api/v1/loans/x"),
        ("DELETE", "/api/v1/loans/x"),
        ("POST", "/api/v1/loans/x/return"),
        ("POST", "/api/v1/loans/x/reopen"),
    ] {
        let (st, _, _) = call(&s.state, m, p, None, Some(json!({}))).await;
        assert_eq!(st, 401, "{m} {p}");
    }
}

#[tokio::test]
async fn mutations_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(&s, &book, json!({})).await;
    let id = l["id"].as_str().unwrap().to_string();
    req(
        &s,
        "PATCH",
        &format!("/api/v1/loans/{id}"),
        Some(json!({"notes": "n"})),
    )
    .await;
    req(
        &s,
        "POST",
        &format!("/api/v1/loans/{id}/return"),
        Some(json!({})),
    )
    .await;
    req(
        &s,
        "POST",
        &format!("/api/v1/loans/{id}/return"),
        Some(json!({})),
    )
    .await;
    req(&s, "POST", &format!("/api/v1/loans/{id}/reopen"), None).await;
    req(&s, "POST", &format!("/api/v1/loans/{id}/reopen"), None).await;
    req(&s, "DELETE", &format!("/api/v1/loans/{id}"), None).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let got: Vec<(&str, &str, &str)> = rows
        .iter()
        .map(|(a, t, i)| (a.as_str(), t.as_str(), i.as_str()))
        .collect();
    let want: Vec<(&str, &str, &str)> = [
        "loan.create",
        "loan.update",
        "loan.return",
        "loan.reopen",
        "loan.delete",
    ]
    .iter()
    .map(|a| (*a, "loan", id.as_str()))
    .collect();
    assert_eq!(got, want);
}

#[tokio::test]
async fn lent_at_cannot_pass_returned_at() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let t = now();
    let l = lend(&s, &book, json!({"lent_at": t - 1000})).await;
    let id = l["id"].as_str().unwrap();
    let (st, _) = req(
        &s,
        "POST",
        &format!("/api/v1/loans/{id}/return"),
        Some(json!({"returned_at": t - 500})),
    )
    .await;
    assert_eq!(st, 200);
    let path = format!("/api/v1/loans/{id}");
    let (st, b) = req(&s, "PATCH", &path, Some(json!({"lent_at": t - 100}))).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
    // The rejected patch changed nothing.
    let (st, b) = req(&s, "GET", "/api/v1/loans?status=returned", None).await;
    assert_eq!(
        (st, b["items"][0]["lent_at"].as_i64()),
        (200, Some(t - 1000))
    );
    let (st, b) = req(&s, "PATCH", &path, Some(json!({"lent_at": t - 500}))).await;
    assert_eq!((st, b["lent_at"].as_i64()), (200, Some(t - 500)));
    let (_, b) = req(&s, "GET", "/api/v1/loans?status=returned", None).await;
    assert_eq!(b["items"][0]["lent_at"].as_i64(), Some(t - 500));
}

async fn fresh_loan_path(s: &Seeded) -> String {
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(s, &book, json!({"lent_at": now() - 1000})).await;
    format!("/api/v1/loans/{}/return", l["id"].as_str().unwrap())
}

#[tokio::test]
async fn return_without_a_body_uses_now() {
    let s = seed(Role::Owner, None, None).await;
    let path = fresh_loan_path(&s).await;
    let before = now();
    let (st, b) = req(&s, "POST", &path, None).await;
    assert_eq!(st, 200, "{b}");
    let r = b["returned_at"].as_i64().unwrap();
    assert!(r >= before && r <= now() + 1);
}

#[tokio::test]
async fn return_with_an_empty_object_uses_now() {
    let s = seed(Role::Owner, None, None).await;
    let path = fresh_loan_path(&s).await;
    let before = now();
    let (st, b) = req(&s, "POST", &path, Some(json!({}))).await;
    assert_eq!(st, 200, "{b}");
    assert!(b["returned_at"].as_i64().unwrap() >= before);
}

#[tokio::test]
async fn return_with_malformed_json_is_bad_request() {
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let s = seed(Role::Owner, None, None).await;
    let path = fresh_loan_path(&s).await;
    let req = Request::builder()
        .method("POST")
        .uri(&path)
        .header(
            "authorization",
            format!("Bearer {}", s.session.access_token),
        )
        .header("content-type", "application/json")
        .body(Body::from("{not json"))
        .unwrap();
    let resp = bookeeper_core::router(s.state.clone())
        .oneshot(req)
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 400);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let b: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(b["error_code"], "bad_request");
}

#[test]
fn return_body_is_optional_in_openapi() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    let rb = &doc["paths"]["/api/v1/loans/{id}/return"]["post"]["requestBody"];
    assert!(rb.is_object(), "{rb}");
    assert_ne!(rb["required"], json!(true), "{rb}");
}

async fn raw_return(s: &Seeded, id: &str, content_type: Option<&str>, body: &str) -> (u16, Value) {
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let mut r = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/loans/{id}/return"))
        .header(
            "authorization",
            format!("Bearer {}", s.session.access_token),
        );
    if let Some(ct) = content_type {
        r = r.header("content-type", ct);
    }
    let resp = bookeeper_core::router(s.state.clone())
        .oneshot(r.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let st = resp.status().as_u16();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (st, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn open_loan(s: &Seeded) -> String {
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let l = lend(s, &book, json!({"lent_at": now() - 1000})).await;
    l["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn return_with_a_non_json_content_type_is_bad_request() {
    let s = seed(Role::Owner, None, None).await;
    let id = open_loan(&s).await;
    let (st, b) = raw_return(&s, &id, Some("text/plain"), r#"{"returned_at": 123}"#).await;
    assert_eq!((st, b["error_code"].as_str()), (400, Some("bad_request")));
}

#[tokio::test]
async fn return_accepts_json_with_a_charset() {
    let s = seed(Role::Owner, None, None).await;
    let id = open_loan(&s).await;
    let t = now() - 500;
    let body = format!(r#"{{"returned_at": {t}}}"#);
    let (st, b) = raw_return(&s, &id, Some("application/json; charset=utf-8"), &body).await;
    assert_eq!((st, b["returned_at"].as_i64()), (200, Some(t)));
}

#[tokio::test]
async fn return_without_a_body_ignores_the_content_type() {
    let s = seed(Role::Owner, None, None).await;
    let id = open_loan(&s).await;
    let (st, b) = raw_return(&s, &id, Some("text/plain"), "").await;
    assert_eq!(st, 200, "{b}");
    assert!(b["returned_at"].as_i64().is_some());
}

async fn lend_as(s: &Seeded, name: &str, lent_at: i64) {
    let book = insert_book(&s.state, &s.library_id, &format!("B-{name}-{lent_at}")).await;
    lend(s, &book, json!({"borrower_name": name, "lent_at": lent_at})).await;
}

fn names(b: &Value) -> Vec<&str> {
    b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn borrowers_match_prefix_ignoring_case_and_are_distinct() {
    let s = seed(Role::Owner, None, None).await;
    lend_as(&s, "marta", 100).await;
    lend_as(&s, "Marco", 200).await;
    lend_as(&s, "MARTA", 300).await;
    lend_as(&s, "Luca", 400).await;
    let (st, b) = req(&s, "GET", "/api/v1/loans/borrowers?q=MAR", None).await;
    assert_eq!(st, 200);
    assert_eq!(names(&b), ["MARTA", "Marco"]);
    let (_, b) = req(&s, "GET", "/api/v1/loans/borrowers?q=zz", None).await;
    assert!(names(&b).is_empty());
}

#[tokio::test]
async fn borrowers_empty_query_gives_ten_most_recent() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..12 {
        lend_as(&s, &format!("Nome{i:02}"), 1000 + i).await;
    }
    for path in ["/api/v1/loans/borrowers", "/api/v1/loans/borrowers?q="] {
        let (st, b) = req(&s, "GET", path, None).await;
        assert_eq!(st, 200);
        let n = names(&b);
        assert_eq!(n.len(), 10);
        assert_eq!(n[0], "Nome11");
        assert_eq!(n[9], "Nome02");
    }
}

#[tokio::test]
async fn borrowers_are_isolated_and_need_member_role() {
    let s = seed(Role::Owner, None, None).await;
    lend_as(&s, "Marta", 100).await;
    let (_, other) = other_library(&s.state).await;
    let (st, b) = req_as_token(&s, &other.access_token, "/api/v1/loans/borrowers").await;
    assert_eq!(st, 200);
    assert!(names(&b).is_empty());
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gus").await;
    let (st, _) = req_as_token(&s, &guest.access_token, "/api/v1/loans/borrowers").await;
    assert_eq!(st, 403);
    let (_, member) = add_user(&s.state, &s.library_id, Role::Member, "Meg").await;
    let (st, b) = req_as_token(&s, &member.access_token, "/api/v1/loans/borrowers").await;
    assert_eq!(st, 200);
    assert_eq!(names(&b), ["Marta"]);
}

async fn req_as_token(s: &Seeded, token: &str, path: &str) -> (u16, Value) {
    let (st, _, b) = call(&s.state, "GET", path, Some(token), None).await;
    (st, b)
}
