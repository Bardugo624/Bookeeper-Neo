mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

fn tok(s: &Seeded) -> String {
    s.session.access_token.clone()
}

async fn create(s: &Seeded, body: Value) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/shelves",
        Some(&tok(s)),
        Some(body),
    )
    .await;
    (st, b)
}

async fn new_shelf(s: &Seeded, name: &str) -> Value {
    let (st, b) = create(s, json!({"name": name, "rows": 2, "slots_per_row": 5})).await;
    assert_eq!(st, 201, "{b}");
    b
}

async fn place(s: &Seeded, book: &str, shelf: &str, row: i64, slot: i64) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book}/placement"),
        Some(&tok(s)),
        Some(json!({"shelf_id": shelf, "row_index": row, "slot_index": slot})),
    )
    .await;
    (st, b)
}

async fn get(s: &Seeded, path: &str) -> (u16, Value) {
    let (st, _, b) = call(&s.state, "GET", path, Some(&tok(s)), None).await;
    (st, b)
}

#[tokio::test]
async fn create_assigns_label_codes_in_order() {
    let s = seed(Role::Owner, None, None).await;
    let a = new_shelf(&s, "A").await;
    let b = new_shelf(&s, "B").await;
    let c = new_shelf(&s, "C").await;
    assert_eq!(
        [&a, &b, &c].map(|x| x["label_code"].as_i64().unwrap()),
        [1, 2, 3]
    );
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/shelves/{}", b["id"].as_str().unwrap()),
        Some(&tok(&s)),
        None,
    )
    .await;
    assert_eq!(st, 204);
    let d = new_shelf(&s, "D").await;
    assert_eq!(d["label_code"], 2);
}

#[tokio::test]
async fn create_defaults_and_capacity() {
    let s = seed(Role::Owner, None, None).await;
    let (st, b) = create(&s, json!({"name": " Sala ", "rows": 3, "slots_per_row": 7})).await;
    assert_eq!(st, 201);
    assert_eq!(b["color"], "sage");
    assert_eq!(b["name"], "Sala");
    assert_eq!(b["capacity"], 21);
    assert_eq!(b["book_count"], 0);
    assert_eq!(b["icon"], Value::Null);
    assert_eq!(b["room_id"], Value::Null);
}

#[tokio::test]
async fn validation_table() {
    let s = seed(Role::Owner, None, None).await;
    let cases = [
        json!({"name": "", "rows": 2, "slots_per_row": 5}),
        json!({"name": "x", "rows": 0, "slots_per_row": 5}),
        json!({"name": "x", "rows": 13, "slots_per_row": 5}),
        json!({"name": "x", "rows": 2, "slots_per_row": 4}),
        json!({"name": "x", "rows": 2, "slots_per_row": 61}),
        json!({"name": "x", "rows": 2, "slots_per_row": 5, "color": "pink"}),
    ];
    for body in cases {
        let (st, b) = create(&s, body.clone()).await;
        assert_eq!(st, 422, "{body}");
        assert_eq!(b["error_code"], "validation");
    }
}

#[tokio::test]
async fn list_is_ordered_by_label_code_with_book_counts() {
    let s = seed(Role::Owner, None, None).await;
    let a = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let _b = insert_shelf(&s.state, &s.library_id, "B", 2, 5).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    assert_eq!(place(&s, &book, &a, 0, 0).await.0, 200);
    let (st, b) = get(&s, "/api/v1/shelves").await;
    assert_eq!(st, 200);
    let items = b["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["name"], "A");
    assert_eq!(items[0]["label_code"], 1);
    assert_eq!(items[0]["book_count"], 1);
    assert_eq!(items[1]["name"], "B");
    assert_eq!(items[1]["book_count"], 0);
}

#[tokio::test]
async fn patch_renames_and_recolours() {
    let s = seed(Role::Owner, None, None).await;
    let sh = create(
        &s,
        json!({"name": "A", "rows": 2, "slots_per_row": 5, "icon": "book"}),
    )
    .await
    .1;
    let path = format!("/api/v1/shelves/{}", sh["id"].as_str().unwrap());
    let (st, _, b) = call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"name": "Nuovo", "color": "plum"})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(
        (b["name"].as_str(), b["color"].as_str()),
        (Some("Nuovo"), Some("plum"))
    );
    assert_eq!(b["icon"], "book");
    assert_eq!(b["rows"], 2);
    let (_, _, b) = call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"icon": null})),
    )
    .await;
    assert_eq!(b["icon"], Value::Null);
    assert_eq!(b["name"], "Nuovo");
    let (st, _, _) = call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"name": null})),
    )
    .await;
    assert_eq!(st, 422);
    let (st, _, _) = call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"color": "pink"})),
    )
    .await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn shrinking_below_a_placed_book_is_conflict() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 3, 10).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    assert_eq!(place(&s, &book, &sh, 2, 7).await.0, 200);
    let path = format!("/api/v1/shelves/{sh}");
    for body in [json!({"rows": 2}), json!({"slots_per_row": 7})] {
        let (st, _, b) = call(&s.state, "PATCH", &path, Some(&tok(&s)), Some(body)).await;
        assert_eq!(st, 409);
        assert_eq!(b["error_code"], "shelf_too_small");
    }
    let (_, b) = get(&s, &path).await;
    assert_eq!(
        (b["rows"].clone(), b["slots_per_row"].clone()),
        (json!(3), json!(10))
    );
    let (st, _, b) = call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"rows": 3, "slots_per_row": 8})),
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(b["slots_per_row"], 8);
}

#[tokio::test]
async fn delete_shelf_keeps_the_books_unplaced() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    place(&s, &book, &sh, 0, 0).await;
    let (st, _, _) = call(
        &s.state,
        "DELETE",
        &format!("/api/v1/shelves/{sh}"),
        Some(&tok(&s)),
        None,
    )
    .await;
    assert_eq!(st, 204);
    assert_eq!(get(&s, &format!("/api/v1/shelves/{sh}")).await.0, 404);
    let (n_books, n_placed) = s
        .state
        .db
        .run(|c| {
            Ok((
                c.query_row("SELECT COUNT(*) FROM books", [], |r| r.get::<_, i64>(0))?,
                c.query_row("SELECT COUNT(*) FROM shelf_books", [], |r| {
                    r.get::<_, i64>(0)
                })?,
            ))
        })
        .await
        .unwrap();
    assert_eq!((n_books, n_placed), (1, 0));
}

#[tokio::test]
async fn place_then_move_frees_the_old_slot() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    let b2 = insert_book(&s.state, &s.library_id, "Due").await;
    let (st, p) = place(&s, &b1, &sh, 0, 0).await;
    assert_eq!(st, 200);
    assert_eq!(p, json!({"shelf_id": sh, "row_index": 0, "slot_index": 0}));
    assert_eq!(place(&s, &b1, &sh, 1, 3).await.0, 200);
    assert_eq!(place(&s, &b2, &sh, 0, 0).await.0, 200);
    let (_, b) = get(&s, &format!("/api/v1/shelves/{sh}/books")).await;
    assert_eq!(b["items"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn placing_on_a_taken_slot_is_conflict() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    let b2 = insert_book(&s.state, &s.library_id, "Due").await;
    place(&s, &b1, &sh, 0, 0).await;
    let (st, b) = place(&s, &b2, &sh, 0, 0).await;
    assert_eq!(st, 409);
    assert_eq!(b["error_code"], "slot_taken");
}

#[tokio::test]
async fn placing_a_book_where_it_already_is_succeeds() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    assert_eq!(place(&s, &b1, &sh, 1, 1).await.0, 200);
    assert_eq!(place(&s, &b1, &sh, 1, 1).await.0, 200);
}

#[tokio::test]
async fn out_of_range_slot_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    for (r, c) in [(2, 0), (0, 5), (0, -1), (-1, 0)] {
        let (st, b) = place(&s, &b1, &sh, r, c).await;
        assert_eq!(st, 422, "{r},{c}");
        assert_eq!(b["error_code"], "validation");
    }
    let (st, _, _) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{b1}/placement"),
        Some(&tok(&s)),
        Some(json!({"shelf_id": sh, "row_index": 0, "slot_index": 0, "spine_width": 4})),
    )
    .await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn unplace_is_idempotent() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    place(&s, &b1, &sh, 0, 0).await;
    let path = format!("/api/v1/books/{b1}/placement");
    for _ in 0..2 {
        let (st, _, _) = call(&s.state, "DELETE", &path, Some(&tok(&s)), None).await;
        assert_eq!(st, 204);
    }
    let (_, b) = get(&s, &format!("/api/v1/shelves/{sh}")).await;
    assert_eq!(b["book_count"], 0);
}

#[tokio::test]
async fn shelf_books_are_ordered_by_row_then_slot() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 3, 5).await;
    let spots = [(1, 0), (0, 4), (0, 1), (2, 2)];
    for (i, (r, c)) in spots.iter().enumerate() {
        let id = insert_book(&s.state, &s.library_id, &format!("L{i}")).await;
        assert_eq!(place(&s, &id, &sh, *r, *c).await.0, 200);
    }
    let (st, b) = get(&s, &format!("/api/v1/shelves/{sh}/books")).await;
    assert_eq!(st, 200);
    let got: Vec<(i64, i64)> = b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| {
            (
                x["row_index"].as_i64().unwrap(),
                x["slot_index"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(got, [(0, 1), (0, 4), (1, 0), (2, 2)]);
    assert!(b["items"][0]["authors"].is_array());
    assert_eq!(b["items"][0]["title"], "L2");
}

async fn batch(s: &Seeded, shelf: &str, ids: &[String]) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "POST",
        &format!("/api/v1/shelves/{shelf}/batch-assign"),
        Some(&tok(s)),
        Some(json!({"book_ids": ids})),
    )
    .await;
    (st, b)
}

#[tokio::test]
async fn batch_assign_fills_free_slots_in_order() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 1, 5).await;
    let fixed = insert_book(&s.state, &s.library_id, "Fisso").await;
    place(&s, &fixed, &sh, 0, 1).await;
    let mut ids = vec![];
    for i in 0..3 {
        ids.push(insert_book(&s.state, &s.library_id, &format!("L{i}")).await);
    }
    let (st, b) = batch(&s, &sh, &ids).await;
    assert_eq!(st, 200, "{b}");
    let placed: Vec<(String, i64)> = b["placed"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| {
            (
                p["book_id"].as_str().unwrap().to_string(),
                p["slot_index"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        placed,
        vec![
            (ids[0].clone(), 0),
            (ids[1].clone(), 2),
            (ids[2].clone(), 3)
        ]
    );
    assert_eq!(b["skipped_already_placed"], 0);
    assert_eq!(b["skipped_no_space"], 0);
}

#[tokio::test]
async fn batch_assign_reports_skipped() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 1, 5).await;
    let other = insert_shelf(&s.state, &s.library_id, "B", 1, 5).await;
    let (olib, osess) = other_library(&s.state).await;
    let foreign = insert_book(&s.state, &olib, "Altrui").await;
    let _ = osess;
    let placed_elsewhere = insert_book(&s.state, &s.library_id, "Altrove").await;
    place(&s, &placed_elsewhere, &other, 0, 0).await;
    let mut ids = vec![placed_elsewhere.clone()];
    for i in 0..6 {
        ids.push(insert_book(&s.state, &s.library_id, &format!("L{i}")).await);
    }
    ids.push(ids[1].clone());
    ids.push("unknown".into());
    ids.push(foreign);
    let (st, b) = batch(&s, &sh, &ids).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["placed"].as_array().unwrap().len(), 5);
    assert_eq!(b["skipped_already_placed"], 1);
    assert_eq!(b["skipped_no_space"], 1);
    let (_, sb) = get(&s, &format!("/api/v1/shelves/{sh}")).await;
    assert_eq!(sb["book_count"], 5);

    let many: Vec<String> = (0..501).map(|i| format!("id{i}")).collect();
    assert_eq!(batch(&s, &sh, &many).await.0, 422);
}

#[tokio::test]
async fn concurrent_placement_one_wins() {
    let s = seed(Role::Owner, None, None).await;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    let b2 = insert_book(&s.state, &s.library_id, "Due").await;
    let (r1, r2) = tokio::join!(place(&s, &b1, &sh, 1, 2), place(&s, &b2, &sh, 1, 2));
    let mut codes = [r1.0, r2.0];
    codes.sort();
    assert_eq!(codes, [200, 409]);
    let loser = if r1.0 == 409 { r1 } else { r2 };
    assert_eq!(loser.1["error_code"], "slot_taken");
}

#[tokio::test]
async fn other_library_gets_not_found_everywhere() {
    let s = seed(Role::Owner, None, None).await;
    let my_shelf = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let my_book = insert_book(&s.state, &s.library_id, "Mio").await;
    let (olib, osess) = other_library(&s.state).await;
    let their_shelf = insert_shelf(&s.state, &olib, "Z", 2, 5).await;
    let their_book = insert_book(&s.state, &olib, "Loro").await;
    let t = &s.session.access_token;
    let _ = osess;

    let cases: Vec<(&str, String, Option<Value>)> = vec![
        ("GET", format!("/api/v1/shelves/{their_shelf}"), None),
        (
            "PATCH",
            format!("/api/v1/shelves/{their_shelf}"),
            Some(json!({"name": "x"})),
        ),
        ("DELETE", format!("/api/v1/shelves/{their_shelf}"), None),
        ("GET", format!("/api/v1/shelves/{their_shelf}/books"), None),
        (
            "POST",
            format!("/api/v1/shelves/{their_shelf}/batch-assign"),
            Some(json!({"book_ids": []})),
        ),
        (
            "PUT",
            format!("/api/v1/books/{their_book}/placement"),
            Some(json!({"shelf_id": my_shelf, "row_index": 0, "slot_index": 0})),
        ),
        (
            "DELETE",
            format!("/api/v1/books/{their_book}/placement"),
            None,
        ),
        (
            "PUT",
            format!("/api/v1/books/{my_book}/placement"),
            Some(json!({"shelf_id": their_shelf, "row_index": 0, "slot_index": 0})),
        ),
        ("GET", "/api/v1/shelves/not-a-uuid".to_string(), None),
    ];
    for (m, path, body) in cases {
        let (st, _, b) = call(&s.state, m, &path, Some(t), body).await;
        assert_eq!(st, 404, "{m} {path}");
        assert_eq!(b["error_code"], "not_found");
    }
    // nothing leaked into the other library
    let (_, b) = get(&s, "/api/v1/shelves").await;
    assert_eq!(b["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn guest_can_read_but_not_write() {
    let s = seed(Role::Owner, None, None).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let g = guest.access_token;
    let sh = insert_shelf(&s.state, &s.library_id, "A", 2, 5).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    for path in [
        "/api/v1/shelves".to_string(),
        format!("/api/v1/shelves/{sh}"),
        format!("/api/v1/shelves/{sh}/books"),
    ] {
        assert_eq!(
            call(&s.state, "GET", &path, Some(&g), None).await.0,
            200,
            "{path}"
        );
    }
    let writes: Vec<(&str, String, Option<Value>)> = vec![
        (
            "POST",
            "/api/v1/shelves".into(),
            Some(json!({"name": "x", "rows": 2, "slots_per_row": 5})),
        ),
        (
            "PATCH",
            format!("/api/v1/shelves/{sh}"),
            Some(json!({"name": "x"})),
        ),
        ("DELETE", format!("/api/v1/shelves/{sh}"), None),
        (
            "POST",
            format!("/api/v1/shelves/{sh}/batch-assign"),
            Some(json!({"book_ids": [book]})),
        ),
        (
            "PUT",
            format!("/api/v1/books/{book}/placement"),
            Some(json!({"shelf_id": sh, "row_index": 0, "slot_index": 0})),
        ),
        ("DELETE", format!("/api/v1/books/{book}/placement"), None),
    ];
    for (m, path, body) in writes {
        let (st, _, b) = call(&s.state, m, &path, Some(&g), body).await;
        assert_eq!(st, 403, "{m} {path}");
        assert_eq!(b["error_code"], "forbidden");
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let routes = [
        ("GET", "/api/v1/shelves"),
        ("POST", "/api/v1/shelves"),
        ("GET", "/api/v1/shelves/x"),
        ("PATCH", "/api/v1/shelves/x"),
        ("DELETE", "/api/v1/shelves/x"),
        ("GET", "/api/v1/shelves/x/books"),
        ("POST", "/api/v1/shelves/x/batch-assign"),
        ("PUT", "/api/v1/books/x/placement"),
        ("DELETE", "/api/v1/books/x/placement"),
    ];
    for (m, p) in routes {
        let body = (m != "GET" && m != "DELETE").then(|| json!({}));
        let (st, _, b) = call(&s.state, m, p, None, body).await;
        assert_eq!(st, 401, "{m} {p}");
        assert_eq!(b["error_code"], "unauthorized");
    }
}

#[tokio::test]
async fn mutations_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let sh = new_shelf(&s, "A").await;
    let sid = sh["id"].as_str().unwrap().to_string();
    let b1 = insert_book(&s.state, &s.library_id, "Uno").await;
    let b2 = insert_book(&s.state, &s.library_id, "Due").await;
    let b3 = insert_book(&s.state, &s.library_id, "Tre").await;
    let path = format!("/api/v1/shelves/{sid}");
    call(
        &s.state,
        "PATCH",
        &path,
        Some(&tok(&s)),
        Some(json!({"name": "B"})),
    )
    .await;
    place(&s, &b1, &sid, 0, 0).await;
    call(
        &s.state,
        "DELETE",
        &format!("/api/v1/books/{b1}/placement"),
        Some(&tok(&s)),
        None,
    )
    .await;
    batch(&s, &sid, &[b2.clone(), b3.clone()]).await;
    call(&s.state, "DELETE", &path, Some(&tok(&s)), None).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let t = |a: &str, e: &str, id: &str| (a.to_string(), e.to_string(), id.to_string());
    assert_eq!(
        rows,
        vec![
            t("shelf.create", "shelf", &sid),
            t("shelf.update", "shelf", &sid),
            t("shelf.place", "book", &b1),
            t("shelf.unplace", "book", &b1),
            t("shelf.place", "book", &b2),
            t("shelf.place", "book", &b3),
            t("shelf.delete", "shelf", &sid),
        ]
    );
}
