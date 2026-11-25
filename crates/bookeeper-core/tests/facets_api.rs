mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn get_facets(s: &Seeded, token: &str) -> Value {
    let (st, _, b) = call(&s.state, "GET", "/api/v1/books/facets", Some(token), None).await;
    assert_eq!(st, 200, "{b}");
    b
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

async fn exec(s: &Seeded, sql: &'static str, args: Vec<String>) {
    s.state
        .db
        .run(move |c| c.execute(sql, rusqlite::params_from_iter(args.iter())))
        .await
        .unwrap();
}

fn pairs(v: &Value) -> Vec<(String, i64)> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|e| {
            (
                e["value"].as_str().unwrap().to_string(),
                e["count"].as_i64().unwrap(),
            )
        })
        .collect()
}

#[tokio::test]
async fn empty_library() {
    let s = seed(Role::Owner, None, None).await;
    let f = get_facets(&s, &s.session.access_token).await;
    for k in ["genres", "languages", "formats", "tags", "rooms", "shelves"] {
        assert_eq!(f[k], json!([]), "{k}");
    }
    assert_eq!(f["years"], json!({"min": null, "max": null}));
    assert_eq!(
        f["reading"],
        json!({"to_read": 0, "reading": 0, "read": 0, "abandoned": 0, "none": 0})
    );
}

#[tokio::test]
async fn counts_for_every_facet() {
    let s = seed(Role::Owner, None, None).await;
    let a = create(&s, json!({"title": "A", "genre": "Giallo", "language": "it", "format": "ebook", "published_year": 1980})).await;
    let b = create(&s, json!({"title": "B", "genre": "Saggio", "language": "it", "format": "ebook", "published_year": 2020})).await;
    let c = create(
        &s,
        json!({"title": "C", "genre": "Saggio", "format": "paperback"}),
    )
    .await;
    create(&s, json!({"title": "D"})).await;
    // tags
    let mut tags = Vec::new();
    for n in ["uno", "due", "vuoto"] {
        let (_, _, t) = call(
            &s.state,
            "POST",
            "/api/v1/tags",
            Some(&s.session.access_token),
            Some(json!({"name": n})),
        )
        .await;
        tags.push(t["id"].as_str().unwrap().to_string());
    }
    for (book, ts) in [(&a, vec![&tags[0], &tags[1]]), (&b, vec![&tags[0]])] {
        let (st, _, r) = call(
            &s.state,
            "PUT",
            &format!("/api/v1/books/{book}/tags"),
            Some(&s.session.access_token),
            Some(json!({"tag_ids": ts})),
        )
        .await;
        assert_eq!(st, 200, "{r}");
    }
    // rooms and shelves
    let room = "room-1".to_string();
    exec(
        &s,
        "INSERT INTO rooms (id, library_id, name, created_at) VALUES (?1, ?2, 'Salotto', 1)",
        vec![room.clone(), s.library_id.clone()],
    )
    .await;
    let sh1 = insert_shelf(&s.state, &s.library_id, "S1", 1, 5).await;
    let sh2 = insert_shelf(&s.state, &s.library_id, "S2", 1, 5).await;
    exec(
        &s,
        "UPDATE shelves SET room_id = ?1 WHERE id IN (?2, ?3)",
        vec![room.clone(), sh1.clone(), sh2.clone()],
    )
    .await;
    for (i, (book, shelf)) in [(&a, &sh1), (&b, &sh1), (&c, &sh2)].into_iter().enumerate() {
        exec(&s, "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at) VALUES (?1, ?2, 0, ?3, 1)", vec![book.clone(), shelf.clone(), i.to_string()]).await;
    }
    // reading
    for (book, st) in [(&a, "read"), (&b, "read"), (&c, "reading")] {
        let (code, _, r) = call(
            &s.state,
            "PUT",
            &format!("/api/v1/books/{book}/reading"),
            Some(&s.session.access_token),
            Some(json!({"status": st})),
        )
        .await;
        assert_eq!(code, 200, "{r}");
    }

    let f = get_facets(&s, &s.session.access_token).await;
    assert_eq!(
        pairs(&f["genres"]),
        [("Saggio".into(), 2), ("Giallo".into(), 1)]
    );
    assert_eq!(pairs(&f["languages"]), [("it".into(), 2)]);
    assert_eq!(
        pairs(&f["formats"]),
        [("ebook".into(), 2), ("paperback".into(), 1)]
    );
    assert_eq!(f["years"], json!({"min": 1980, "max": 2020}));
    let t: Vec<(String, i64)> = f["tags"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| {
            (
                t["name"].as_str().unwrap().to_string(),
                t["count"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(t, [("uno".to_string(), 2), ("due".to_string(), 1)]);
    assert!(f["tags"][0]["color"].is_string() && f["tags"][0]["id"] == tags[0]);
    assert_eq!(
        f["rooms"],
        json!([{"id": room, "name": "Salotto", "count": 3}])
    );
    let sh: Vec<(String, i64)> = f["shelves"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| {
            (
                t["id"].as_str().unwrap().to_string(),
                t["count"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(sh, [(sh1, 2), (sh2, 1)]);
    assert_eq!(
        f["reading"],
        json!({"to_read": 0, "reading": 1, "read": 2, "abandoned": 0, "none": 1})
    );
}

#[tokio::test]
async fn genres_and_languages_group_ignoring_case_with_most_frequent_spelling() {
    let s = seed(Role::Owner, None, None).await;
    for g in ["giallo", "Giallo", "Giallo", "GIALLO", "Horror"] {
        create(&s, json!({"title": "x", "genre": g, "language": g})).await;
    }
    let f = get_facets(&s, &s.session.access_token).await;
    assert_eq!(
        pairs(&f["genres"]),
        [("Giallo".into(), 4), ("Horror".into(), 1)]
    );
    assert_eq!(
        pairs(&f["languages"]),
        [("Giallo".into(), 4), ("Horror".into(), 1)]
    );
}

#[tokio::test]
async fn genres_are_capped_at_two_hundred_most_frequent_first() {
    let s = seed(Role::Owner, None, None).await;
    let lib = s.library_id.clone();
    s.state
        .db
        .run(move |c| {
            let tx = c.unchecked_transaction()?;
            for i in 0..250i64 {
                // Genre i appears (i % 3) + 1 times, so "g000" has 1; "common" 5 times.
                for k in 0..=(i % 3) {
                    tx.execute(
                        "INSERT INTO books (id, library_id, title, genre, created_at, updated_at) VALUES (?1, ?2, 't', ?3, 1, 1)",
                        rusqlite::params![format!("b{i}-{k}"), lib, format!("g{i:03}")],
                    )?;
                }
            }
            for k in 0..5 {
                tx.execute(
                    "INSERT INTO books (id, library_id, title, genre, created_at, updated_at) VALUES (?1, ?2, 't', 'common', 1, 1)",
                    rusqlite::params![format!("c{k}"), lib],
                )?;
            }
            tx.commit()
        })
        .await
        .unwrap();
    let f = get_facets(&s, &s.session.access_token).await;
    let g = pairs(&f["genres"]);
    assert_eq!(g.len(), 200);
    assert_eq!(g[0], ("common".to_string(), 5));
    assert!(g.windows(2).all(|w| w[0].1 >= w[1].1));
    // Only count-1 genres are dropped: all 166 genres seen twice or more stay.
    assert_eq!(g.iter().filter(|(_, n)| *n >= 2).count(), 167);
}

#[tokio::test]
async fn reading_is_per_caller() {
    let s = seed(Role::Owner, None, None).await;
    let (_, bob) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let a = create(&s, json!({"title": "A"})).await;
    let b = create(&s, json!({"title": "B"})).await;
    for (tok, book, st) in [
        (&s.session.access_token, &a, "read"),
        (&bob.access_token, &a, "abandoned"),
        (&bob.access_token, &b, "to_read"),
    ] {
        let (code, _, r) = call(
            &s.state,
            "PUT",
            &format!("/api/v1/books/{book}/reading"),
            Some(tok),
            Some(json!({"status": st})),
        )
        .await;
        assert_eq!(code, 200, "{r}");
    }
    let mine = get_facets(&s, &s.session.access_token).await;
    assert_eq!(
        mine["reading"],
        json!({"to_read": 0, "reading": 0, "read": 1, "abandoned": 0, "none": 1})
    );
    let his = get_facets(&s, &bob.access_token).await;
    assert_eq!(
        his["reading"],
        json!({"to_read": 1, "reading": 0, "read": 0, "abandoned": 1, "none": 0})
    );
}

#[tokio::test]
async fn counts_cover_the_library_not_a_filter_and_never_another_library() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = other_library(&s.state).await;
    create(&s, json!({"title": "Mio", "genre": "Giallo"})).await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(&other.access_token),
        Some(json!({"title": "Suo", "genre": "Giallo", "published_year": 1500})),
    )
    .await;
    assert_eq!(st, 201);
    // Query parameters are ignored: facets never depend on a filter.
    let (st, _, f) = call(
        &s.state,
        "GET",
        "/api/v1/books/facets?genre=zzz",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(pairs(&f["genres"]), [("Giallo".into(), 1)]);
    assert_eq!(f["years"], json!({"min": null, "max": null}));
    assert_eq!(f["reading"]["none"], 1);
}

#[tokio::test]
async fn needs_a_token_and_is_in_openapi() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, b) = call(&s.state, "GET", "/api/v1/books/facets", None, None).await;
    assert_eq!(st, 401);
    assert_eq!(b["error_code"], "unauthorized");
    let (_, _, doc) = call(&s.state, "GET", "/api/v1/openapi.json", None, None).await;
    assert!(doc["paths"]["/api/v1/books/facets"]["get"]["responses"]["401"].is_object());
}
