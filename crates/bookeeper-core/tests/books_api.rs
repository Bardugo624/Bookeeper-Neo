mod common;

use bookeeper_core::auth::Role;
use bookeeper_core::AppState;
use common::*;
use serde_json::{json, Value};

async fn post(s: &Seeded, path: &str, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        path,
        Some(&s.session.access_token),
        Some(body),
    )
    .await;
    (st, b)
}

async fn get(state: &AppState, tok: &str, path: &str) -> (u16, Value) {
    let (st, _, b) = call(state, "GET", path, Some(tok), None).await;
    (st, b)
}

async fn patch(s: &Seeded, id: &str, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        Some(body),
    )
    .await;
    (st, b)
}

async fn create(s: &Seeded, body: Value) -> Value {
    let (st, b) = post(s, "/api/v1/books", body).await;
    assert_eq!(st, 201, "{b}");
    b
}

async fn fts_hits(s: &Seeded, term: &str) -> Vec<String> {
    let term = term.to_string();
    s.state
        .db
        .run(move |c| {
            let mut st = c.prepare(
                "SELECT b.id FROM books_fts f JOIN books b ON b.rowid = f.rowid \
                 WHERE books_fts MATCH ?1",
            )?;
            let r = st.query_map([term], |r| r.get(0))?;
            r.collect::<rusqlite::Result<Vec<String>>>()
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn create_with_only_a_title() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "Dune"})).await;
    assert_eq!(b["title"], "Dune");
    assert_eq!(b["authors"], json!([]));
    assert_eq!(b["on_loan"], false);
    assert!(b["placement"].is_null());
    for k in [
        "isbn_13",
        "isbn_10",
        "subtitle",
        "publisher",
        "published_year",
        "language",
        "page_count",
        "description",
        "genre",
        "format",
        "progressive_number",
        "condition",
        "acquired_at",
        "price_cents",
        "notes",
        "cover_color",
    ] {
        assert!(b.get(k).is_some_and(Value::is_null), "{k} should be null");
    }
    assert!(b["created_at"].is_i64() && b["updated_at"].is_i64());
}

#[tokio::test]
async fn create_with_every_field_round_trips() {
    let s = seed(Role::Owner, None, None).await;
    let body = json!({
        "isbn_13": "978-0-306-40615-7", "isbn_10": "0-306-40615-2", "title": "Dune",
        "subtitle": "Book one", "authors": ["Frank Herbert", "Brian Herbert"],
        "publisher": "Chilton", "published_year": 1965, "language": "en", "page_count": 412,
        "description": "Desert planet", "genre": "sf", "format": "hardcover",
        "progressive_number": 7, "condition": "good", "acquired_at": 1700000000,
        "price_cents": 1299, "notes": "gift"
    });
    let b = create(&s, body.clone()).await;
    for (k, v) in body.as_object().unwrap() {
        match k.as_str() {
            "isbn_13" => assert_eq!(b[k], "9780306406157"),
            "isbn_10" => assert_eq!(b[k], "0306406152"),
            _ => assert_eq!(&b[k], v, "{k}"),
        }
    }
    let (st, got) = get(
        &s.state,
        &s.session.access_token,
        &format!("/api/v1/books/{}", b["id"].as_str().unwrap()),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(got, b);
}

#[tokio::test]
async fn validation_table() {
    let s = seed(Role::Owner, None, None).await;
    let authors: Vec<String> = (0..21).map(|i| format!("a{i}")).collect();
    let cases = vec![
        json!({"title": ""}),
        json!({"title": "   "}),
        json!({"title": "x".repeat(301)}),
        json!({"title": "t", "isbn_13": "978-0-306-40615-8"}),
        json!({"title": "t", "authors": authors}),
        json!({"title": "t", "published_year": 0}),
        json!({"title": "t", "published_year": 2101}),
        json!({"title": "t", "format": "tablet"}),
        json!({"title": "t", "price_cents": -1}),
    ];
    for c in cases {
        let (st, b) = post(&s, "/api/v1/books", c.clone()).await;
        assert_eq!(st, 422, "{c}");
        assert_eq!(b["error_code"], "validation");
    }
    let n: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn duplicate_isbn_is_allowed() {
    let s = seed(Role::Owner, None, None).await;
    let body = json!({"title": "Dune", "isbn_13": "9780306406157"});
    let a = create(&s, body.clone()).await;
    let b = create(&s, body).await;
    assert_ne!(a["id"], b["id"]);
}

#[tokio::test]
async fn progressive_must_be_unique_per_library() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "A", "progressive_number": 3})).await;
    let (st, b) = post(
        &s,
        "/api/v1/books",
        json!({"title": "B", "progressive_number": 3}),
    )
    .await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (409, Some("progressive_taken"))
    );
    let (_, other) = other_library(&s.state).await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(&other.access_token),
        Some(json!({"title": "C", "progressive_number": 3})),
    )
    .await;
    assert_eq!(st, 201);
}

#[tokio::test]
async fn next_progressive() {
    let s = seed(Role::Owner, None, None).await;
    let tok = &s.session.access_token;
    let (st, b) = get(&s.state, tok, "/api/v1/books/next-progressive").await;
    assert_eq!((st, &b["next"]), (200, &json!(1)));
    create(&s, json!({"title": "A", "progressive_number": 7})).await;
    let (_, b) = get(&s.state, tok, "/api/v1/books/next-progressive").await;
    assert_eq!(b["next"], 8);
}

#[tokio::test]
async fn progressive_above_the_maximum_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let (st, e) = post(
        &s,
        "/api/v1/books",
        json!({"title": "T", "progressive_number": 2147483648i64}),
    )
    .await;
    assert_eq!((st, e["error_code"].as_str()), (422, Some("validation")));
    let b = create(&s, json!({"title": "U"})).await;
    let (st, e) = patch(
        &s,
        b["id"].as_str().unwrap(),
        json!({"progressive_number": 2147483648i64}),
    )
    .await;
    assert_eq!((st, e["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn next_progressive_at_the_maximum_is_conflict() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "A", "progressive_number": 2147483647})).await;
    let (st, e) = get(
        &s.state,
        &s.session.access_token,
        "/api/v1/books/next-progressive",
    )
    .await;
    assert_eq!(
        (st, e["error_code"].as_str()),
        (409, Some("progressive_taken"))
    );
}

#[tokio::test]
async fn rapid_patches_never_run_ahead_of_the_clock() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "T"})).await;
    let id = b["id"].as_str().unwrap().to_string();
    let mut last = 0;
    for _ in 0..10 {
        let (st, p) = patch(&s, &id, json!({})).await;
        assert_eq!(st, 200);
        let u = p["updated_at"].as_i64().unwrap();
        assert!(u >= last);
        last = u;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    assert!(last <= now + 1, "updated_at {last} vs now {now}");
}

#[tokio::test]
async fn patch_changes_only_what_is_sent() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(
        &s,
        json!({"title": "Old", "publisher": "P", "authors": ["X"]}),
    )
    .await;
    let (st, p) = patch(&s, b["id"].as_str().unwrap(), json!({"title": "New"})).await;
    assert_eq!(st, 200);
    assert_eq!(p["title"], "New");
    assert_eq!(p["publisher"], "P");
    assert_eq!(p["authors"], json!(["X"]));
}

#[tokio::test]
async fn patch_null_clears_optional_fields() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(
        &s,
        json!({"title": "T", "publisher": "P", "isbn_13": "9780306406157", "progressive_number": 2}),
    )
    .await;
    let (st, p) = patch(
        &s,
        b["id"].as_str().unwrap(),
        json!({"publisher": null, "isbn_13": null, "progressive_number": null}),
    )
    .await;
    assert_eq!(st, 200);
    assert!(
        p["publisher"].is_null() && p["isbn_13"].is_null() && p["progressive_number"].is_null()
    );
}

#[tokio::test]
async fn patch_null_on_title_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "T"})).await;
    let (st, e) = patch(&s, b["id"].as_str().unwrap(), json!({"title": null})).await;
    assert_eq!((st, e["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn patch_bumps_updated_at() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "T"})).await;
    let id = b["id"].as_str().unwrap().to_string();
    let i2 = id.clone();
    s.state
        .db
        .run(move |c| c.execute("UPDATE books SET updated_at = 1 WHERE id = ?1", [i2]))
        .await
        .unwrap();
    let (st, p) = patch(&s, &id, json!({})).await;
    assert_eq!(st, 200);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let u = p["updated_at"].as_i64().unwrap();
    assert!(
        (now - 5..=now + 1).contains(&u),
        "updated_at {u} vs now {now}"
    );
    assert_eq!(p["title"], "T");
    assert_eq!(p["created_at"], b["created_at"]);
}

#[tokio::test]
async fn patch_to_a_taken_progressive_is_conflict() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "A", "progressive_number": 1})).await;
    let b = create(&s, json!({"title": "B", "progressive_number": 2})).await;
    let id = b["id"].as_str().unwrap();
    let (st, e) = patch(&s, id, json!({"progressive_number": 1})).await;
    assert_eq!(
        (st, e["error_code"].as_str()),
        (409, Some("progressive_taken"))
    );
    // Keeping its own number is fine.
    let (st, _) = patch(&s, id, json!({"progressive_number": 2})).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn delete_removes_the_book() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "T"})).await;
    let path = format!("/api/v1/books/{}", b["id"].as_str().unwrap());
    let tok = &s.session.access_token;
    let (st, _, _) = call(&s.state, "DELETE", &path, Some(tok), None).await;
    assert_eq!(st, 204);
    let (st, e) = get(&s.state, tok, &path).await;
    assert_eq!((st, e["error_code"].as_str()), (404, Some("not_found")));
}

#[tokio::test]
async fn batch_delete_ignores_foreign_and_unknown_ids() {
    let s = seed(Role::Owner, None, None).await;
    let (lib2, sess2) = other_library(&s.state).await;
    let mine1 = insert_book(&s.state, &s.library_id, "A").await;
    let mine2 = insert_book(&s.state, &s.library_id, "B").await;
    let foreign = insert_book(&s.state, &lib2, "C").await;
    let (st, b) = post(
        &s,
        "/api/v1/books/batch-delete",
        json!({"ids": [mine1, mine2, foreign, "nope"]}),
    )
    .await;
    assert_eq!((st, &b["deleted"]), (200, &json!(2)));
    let (st, _) = get(
        &s.state,
        &sess2.access_token,
        &format!("/api/v1/books/{foreign}"),
    )
    .await;
    assert_eq!(st, 200);
    let (st, b) = post(&s, "/api/v1/books/batch-delete", json!({"ids": []})).await;
    assert_eq!((st, &b["deleted"]), (200, &json!(0)));
}

#[tokio::test]
async fn batch_delete_over_500_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let ids: Vec<String> = (0..501).map(|i| format!("id{i}")).collect();
    let (st, b) = post(&s, "/api/v1/books/batch-delete", json!({"ids": ids})).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn other_library_cannot_read_patch_or_delete() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = other_library(&s.state).await;
    let id = insert_book(&s.state, &s.library_id, "Mine").await;
    let path = format!("/api/v1/books/{id}");
    let tok = Some(other.access_token.as_str());
    for (method, body) in [
        ("GET", None),
        ("PATCH", Some(json!({"title": "x"}))),
        ("DELETE", None),
    ] {
        let (st, _, e) = call(&s.state, method, &path, tok, body).await;
        assert_eq!(
            (st, e["error_code"].as_str()),
            (404, Some("not_found")),
            "{method}"
        );
    }
}

#[tokio::test]
async fn guest_can_read_but_not_write() {
    let s = seed(Role::Owner, None, None).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gia").await;
    let id = insert_book(&s.state, &s.library_id, "T").await;
    let tok = Some(guest.access_token.as_str());
    let (st, _, _) = call(&s.state, "GET", &format!("/api/v1/books/{id}"), tok, None).await;
    assert_eq!(st, 200);
    let writes = [
        (
            "POST",
            "/api/v1/books".to_string(),
            Some(json!({"title": "x"})),
        ),
        ("PATCH", format!("/api/v1/books/{id}"), Some(json!({}))),
        ("DELETE", format!("/api/v1/books/{id}"), None),
        (
            "POST",
            "/api/v1/books/batch-delete".to_string(),
            Some(json!({"ids": []})),
        ),
    ];
    for (m, p, b) in writes {
        let (st, _, e) = call(&s.state, m, &p, tok, b).await;
        assert_eq!(
            (st, e["error_code"].as_str()),
            (403, Some("forbidden")),
            "{m} {p}"
        );
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let routes = [
        ("POST", "/api/v1/books", Some(json!({"title": "x"}))),
        ("GET", "/api/v1/books/abc", None),
        ("PATCH", "/api/v1/books/abc", Some(json!({}))),
        ("DELETE", "/api/v1/books/abc", None),
        (
            "POST",
            "/api/v1/books/batch-delete",
            Some(json!({"ids": []})),
        ),
        ("GET", "/api/v1/books/next-progressive", None),
    ];
    for (m, p, b) in routes {
        let (st, _, e) = call(&s.state, m, p, None, b).await;
        assert_eq!(
            (st, e["error_code"].as_str()),
            (401, Some("unauthorized")),
            "{m} {p}"
        );
    }
}

#[tokio::test]
async fn fts_row_follows_the_book() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(
        &s,
        json!({"title": "Zanzibar chronicles", "authors": ["Mario Rossi"]}),
    )
    .await;
    let id = b["id"].as_str().unwrap().to_string();
    assert_eq!(fts_hits(&s, "zanzibar").await, vec![id.clone()]);
    assert_eq!(fts_hits(&s, "rossi").await, vec![id.clone()]);
    let (st, _) = patch(&s, &id, json!({"title": "Quokka tales"})).await;
    assert_eq!(st, 200);
    assert!(fts_hits(&s, "zanzibar").await.is_empty());
    assert_eq!(fts_hits(&s, "quokka").await, vec![id.clone()]);
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert!(fts_hits(&s, "quokka").await.is_empty());
    let n: i64 = s
        .state
        .db
        .run(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM books_fts WHERE books_fts MATCH 'quokka'",
                [],
                |r| r.get(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn mutations_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "T", "progressive_number": 1})).await;
    let id = b["id"].as_str().unwrap().to_string();
    let (st, _) = post(
        &s,
        "/api/v1/books",
        json!({"title": "U", "progressive_number": 1}),
    )
    .await;
    assert_eq!(st, 409);
    patch(&s, &id, json!({"title": "T2"})).await;
    call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{id}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let expect: Vec<(String, String, String)> = ["book.create", "book.update", "book.delete"]
        .iter()
        .map(|a| (a.to_string(), "book".to_string(), id.clone()))
        .collect();
    assert_eq!(rows, expect);
}

#[test]
fn routes_are_in_openapi() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    let paths = &doc["paths"];
    assert!(paths["/api/v1/books"]["post"].is_object());
    let one = &paths["/api/v1/books/{id}"];
    assert!(one["get"].is_object() && one["patch"].is_object() && one["delete"].is_object());
    assert!(paths["/api/v1/books/batch-delete"]["post"].is_object());
    assert!(paths["/api/v1/books/next-progressive"]["get"].is_object());
}

#[test]
fn next_progressive_documents_the_conflict() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    assert!(doc["paths"]["/api/v1/books/next-progressive"]["get"]["responses"]["409"].is_object());
}

#[tokio::test]
async fn patch_does_not_revalidate_untouched_fields() {
    let s = seed(Role::Owner, None, None).await;
    let book = create(&s, json!({"title": "Dune"})).await;
    let id = book["id"].as_str().unwrap().to_string();
    let long = "a".repeat(400);
    let (i, l) = (id.clone(), long.clone());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET title = ?1 WHERE id = ?2",
                rusqlite::params![l, i],
            )
        })
        .await
        .unwrap();
    let (st, b) = patch(&s, &id, json!({"notes": "x"})).await;
    assert_eq!((st, b["notes"].as_str()), (200, Some("x")));
    assert_eq!(b["title"].as_str(), Some(long.as_str()));
    let (st, _) = patch(&s, &id, json!({"title": long})).await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn cover_color_on_create_is_lowercased() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "A", "cover_color": "#A1B2C3"})).await;
    assert_eq!(b["cover_color"], "#a1b2c3");
    let b = create(&s, json!({"title": "B"})).await;
    assert!(b["cover_color"].is_null());
}

#[tokio::test]
async fn cover_color_rejects_bad_formats() {
    let s = seed(Role::Owner, None, None).await;
    for bad in ["red", "#fff", "#gggggg", "a1b2c3", "#a1b2c3d", "#ａ1b2c3"] {
        let (st, b) = post(
            &s,
            "/api/v1/books",
            json!({"title": "X", "cover_color": bad}),
        )
        .await;
        assert_eq!(st, 422, "{bad}");
        assert_eq!(b["error_code"], "validation");
    }
    let ok = create(&s, json!({"title": "Y"})).await;
    let id = ok["id"].as_str().unwrap();
    let (st, b) = patch(&s, id, json!({"cover_color": "#fff"})).await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn cover_color_patch_sets_clears_and_leaves() {
    let s = seed(Role::Owner, None, None).await;
    let b = create(&s, json!({"title": "A"})).await;
    let id = b["id"].as_str().unwrap();
    let (st, b) = patch(&s, id, json!({"cover_color": "#00FF7f"})).await;
    assert_eq!(st, 200);
    assert_eq!(b["cover_color"], "#00ff7f");
    let (_, b) = patch(&s, id, json!({"title": "B"})).await;
    assert_eq!(b["cover_color"], "#00ff7f");
    let (st, b) = patch(&s, id, json!({"cover_color": null})).await;
    assert_eq!(st, 200);
    assert!(b["cover_color"].is_null());
}

#[tokio::test]
async fn reading_is_per_caller_in_list_search_and_detail() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let a = create(&s, json!({"title": "Dune Messiah"})).await;
    let b = create(&s, json!({"title": "Dune"})).await;
    let c = create(&s, json!({"title": "Altro"})).await;
    let (ida, idb) = (a["id"].as_str().unwrap(), b["id"].as_str().unwrap());
    assert!(a["reading"].is_null());
    let owner = s.session.access_token.as_str();
    let bob = other.access_token.as_str();
    for (tok, id, body) in [
        (
            owner,
            ida,
            json!({"status": "reading", "current_page": 30, "rating": 4}),
        ),
        (owner, idb, json!({"status": "to_read"})),
        (bob, ida, json!({"status": "read", "rating": 2})),
    ] {
        let (st, _, v) = call(
            &s.state,
            "PUT",
            &format!("/api/v1/books/{id}/reading"),
            Some(tok),
            Some(body),
        )
        .await;
        assert_eq!(st, 200, "{v}");
    }
    let expect_a_owner =
        json!({"status": "reading", "current_page": 30, "progress_percent": null, "rating": 4});
    let expect_a_bob =
        json!({"status": "read", "current_page": null, "progress_percent": null, "rating": 2});

    let (_, list) = get(&s.state, owner, "/api/v1/books").await;
    let by_id = |v: &Value, id: &str| {
        v["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == id)
            .unwrap()
            .clone()
    };
    assert_eq!(by_id(&list, ida)["reading"], expect_a_owner);
    assert_eq!(by_id(&list, idb)["reading"]["status"], "to_read");
    assert!(by_id(&list, c["id"].as_str().unwrap())["reading"].is_null());
    let (_, list) = get(&s.state, bob, "/api/v1/books").await;
    assert_eq!(by_id(&list, ida)["reading"], expect_a_bob);
    assert!(by_id(&list, idb)["reading"].is_null());

    let (_, found) = get(&s.state, owner, "/api/v1/books?q=Messiah").await;
    assert_eq!(found["items"][0]["reading"], expect_a_owner);
    let (_, found) = get(&s.state, bob, "/api/v1/books?q=Messiah").await;
    assert_eq!(found["items"][0]["reading"], expect_a_bob);

    let (_, d) = get(&s.state, owner, &format!("/api/v1/books/{ida}")).await;
    assert_eq!(d["reading"], expect_a_owner);
    let (_, d) = get(&s.state, bob, &format!("/api/v1/books/{ida}")).await;
    assert_eq!(d["reading"], expect_a_bob);
    let (_, d) = get(&s.state, bob, &format!("/api/v1/books/{idb}")).await;
    assert!(d["reading"].is_null());

    let (st, _, p) = call(
        &s.state,
        "PATCH",
        &format!("/api/v1/books/{ida}"),
        Some(bob),
        Some(json!({"notes": "x"})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(p["reading"], expect_a_bob);
}

#[tokio::test]
async fn tags_are_in_list_search_and_detail_ordered_by_name() {
    let s = seed(Role::Owner, None, None).await;
    let book = create(&s, json!({"title": "Dune"})).await;
    let bare = create(&s, json!({"title": "Emma"})).await;
    let bid = book["id"].as_str().unwrap().to_string();
    let mut ids = Vec::new();
    for name in ["zeta", "Alfa", "mid"] {
        let (st, t) = post(&s, "/api/v1/tags", json!({"name": name})).await;
        assert_eq!(st, 201);
        ids.push(t["id"].clone());
    }
    let (st, _, _) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{bid}/tags"),
        Some(&s.session.access_token),
        Some(json!({"tag_ids": ids})),
    )
    .await;
    assert_eq!(st, 200);
    let tag_names = |b: &Value| -> Vec<String> {
        b["tags"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect()
    };
    let tok = &s.session.access_token;
    let (_, d) = get(&s.state, tok, &format!("/api/v1/books/{bid}")).await;
    assert_eq!(tag_names(&d), ["Alfa", "mid", "zeta"]);
    assert!(d["tags"][0]["color"].is_string() && d["tags"][0]["id"].is_string());
    for path in ["/api/v1/books", "/api/v1/books?q=Dune"] {
        let (st, l) = get(&s.state, tok, path).await;
        assert_eq!(st, 200, "{l}");
        let items = l["items"].as_array().unwrap();
        let dune = items.iter().find(|b| b["id"] == book["id"]).unwrap();
        assert_eq!(tag_names(dune), ["Alfa", "mid", "zeta"], "{path}");
        if let Some(e) = items.iter().find(|b| b["id"] == bare["id"]) {
            assert!(e["tags"].as_array().unwrap().is_empty());
        }
    }
    assert!(bare["tags"].as_array().unwrap().is_empty());
}
