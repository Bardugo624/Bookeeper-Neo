mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn create(s: &Seeded, body: Value) -> Value {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(&s.session.access_token),
        Some(body),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    b
}

async fn list(s: &Seeded, query: &str) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books?{query}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    (st, b)
}

async fn ok(s: &Seeded, query: &str) -> Value {
    let (st, b) = list(s, query).await;
    assert_eq!(st, 200, "{query}: {b}");
    b
}

fn titles(b: &Value) -> Vec<String> {
    b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["title"].as_str().unwrap().to_string())
        .collect()
}

fn ids(b: &Value) -> Vec<String> {
    b["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["id"].as_str().unwrap().to_string())
        .collect()
}

async fn exec(s: &Seeded, sql: &'static str, args: Vec<String>) {
    s.state
        .db
        .run(move |c| c.execute(sql, rusqlite::params_from_iter(args.iter())))
        .await
        .unwrap();
}

#[tokio::test]
async fn lists_newest_first_by_default() {
    let s = seed(Role::Owner, None, None).await;
    let a = create(&s, json!({"title": "A"})).await;
    let b = create(&s, json!({"title": "B"})).await;
    let c = create(&s, json!({"title": "C"})).await;
    for (book, t) in [(&a, 100), (&b, 200), (&c, 300)] {
        exec(
            &s,
            "UPDATE books SET created_at = ?1 WHERE id = ?2",
            vec![t.to_string(), book["id"].as_str().unwrap().to_string()],
        )
        .await;
    }
    let r = ok(&s, "").await;
    assert_eq!(titles(&r), ["C", "B", "A"]);
    assert_eq!(r["total"], 3);
    let r = ok(&s, "order=asc").await;
    assert_eq!(titles(&r), ["A", "B", "C"]);
}

#[tokio::test]
async fn total_ignores_limit_and_offset() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..5 {
        create(&s, json!({"title": format!("Libro {i}")})).await;
    }
    let r = ok(&s, "limit=2&offset=2").await;
    assert_eq!(r["items"].as_array().unwrap().len(), 2);
    assert_eq!(r["total"], 5);
}

#[tokio::test]
async fn pagination_is_stable_and_complete() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..5 {
        create(&s, json!({"title": format!("Libro {i}")})).await;
    }
    exec(&s, "UPDATE books SET created_at = 1000", vec![]).await;
    for sort in ["created_at", "title", "author", "year", "progressive"] {
        let mut seen = Vec::new();
        for offset in [0, 2, 4] {
            let r = ok(&s, &format!("sort={sort}&limit=2&offset={offset}")).await;
            seen.extend(ids(&r));
        }
        assert_eq!(seen.len(), 5, "{sort}");
        let mut u = seen.clone();
        u.sort();
        u.dedup();
        assert_eq!(u.len(), 5, "{sort}: repeated ids");
    }
}

#[tokio::test]
async fn search_matches_title_author_isbn_and_notes() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Zebra"})).await;
    create(&s, json!({"title": "Dune", "authors": ["Frank Herbert"]})).await;
    create(&s, json!({"title": "Altro", "isbn_13": "9780306406157"})).await;
    create(
        &s,
        json!({"title": "Appunti", "notes": "prestato a quokka"}),
    )
    .await;
    assert_eq!(titles(&ok(&s, "q=zebra").await), ["Zebra"]);
    assert_eq!(titles(&ok(&s, "q=herbert").await), ["Dune"]);
    assert_eq!(titles(&ok(&s, "q=9780306406157").await), ["Altro"]);
    assert_eq!(titles(&ok(&s, "q=quokka").await), ["Appunti"]);
}

#[tokio::test]
async fn search_is_prefix_on_the_last_word() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Il Gattopardo"})).await;
    create(&s, json!({"title": "Dune"})).await;
    assert_eq!(titles(&ok(&s, "q=gatt").await), ["Il Gattopardo"]);
    assert_eq!(ok(&s, "q=gatt").await["total"], 1);
    // Only the last word is a prefix.
    assert_eq!(ok(&s, "q=gatt%20il").await["total"], 0);
}

#[tokio::test]
async fn search_ignores_diacritics_and_case() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Le città invisibili"})).await;
    create(&s, json!({"title": "Altro"})).await;
    assert_eq!(titles(&ok(&s, "q=CITTA").await), ["Le città invisibili"]);
    assert_eq!(
        titles(&ok(&s, "q=citt%C3%A0").await),
        ["Le città invisibili"]
    );
}

#[tokio::test]
async fn search_needs_all_words() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Il nome della rosa"})).await;
    create(&s, json!({"title": "Il nome del vento"})).await;
    assert_eq!(
        titles(&ok(&s, "q=nome%20rosa").await),
        ["Il nome della rosa"]
    );
}

#[tokio::test]
async fn hostile_queries_are_harmless() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Il nome della rosa"})).await;
    let long = "a".repeat(500);
    let queries = [
        "%22".to_string(),
        "*".to_string(),
        "title%3Ax".to_string(),
        "a%20OR%20b".to_string(),
        "NEAR(".to_string(),
        "-foo".to_string(),
        ")(".to_string(),
        "%22%20OR%20%22".to_string(),
        "NEAR%28a%20b%2C%201%29".to_string(),
        long,
    ];
    for q in queries {
        let (st, b) = list(&s, &format!("q={q}")).await;
        assert_eq!(st, 200, "q={q}: {b}");
    }
    // Operators are plain text: "OR" is a word, not a disjunction.
    assert_eq!(ok(&s, "q=rosa%20OR%20vento").await["total"], 0);
}

#[tokio::test]
async fn empty_or_punctuation_only_query_lists_everything() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Uno"})).await;
    create(&s, json!({"title": "Due"})).await;
    for q in ["", "%20%20", "%22*()-%3A", "...%20%2C%2C"] {
        let r = ok(&s, &format!("q={q}")).await;
        assert_eq!(r["total"], 2, "q={q}");
    }
}

#[tokio::test]
async fn filters_combine() {
    let s = seed(Role::Owner, None, None).await;
    create(
        &s,
        json!({"title": "Match", "genre": "giallo", "language": "it", "format": "paperback"}),
    )
    .await;
    create(
        &s,
        json!({"title": "Other genre", "genre": "saggio", "language": "it", "format": "paperback"}),
    )
    .await;
    create(
        &s,
        json!({"title": "Other lang", "genre": "giallo", "language": "en", "format": "paperback"}),
    )
    .await;
    create(
        &s,
        json!({"title": "Other format", "genre": "giallo", "language": "it", "format": "ebook"}),
    )
    .await;
    let r = ok(&s, "genre=giallo&language=it&format=paperback").await;
    assert_eq!(titles(&r), ["Match"]);
    assert_eq!(r["total"], 1);
    assert_eq!(ok(&s, "genre=giallo").await["total"], 3);
    assert_eq!(ok(&s, "format=ebook").await["total"], 1);
}

#[tokio::test]
async fn shelf_id_and_unshelved() {
    let s = seed(Role::Owner, None, None).await;
    let placed = create(&s, json!({"title": "Sullo scaffale"})).await;
    create(&s, json!({"title": "In giro"})).await;
    let shelf = insert_shelf(&s.state, &s.library_id, "Salotto", 3, 10).await;
    exec(
        &s,
        "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at) \
         VALUES (?1, ?2, 0, 0, 1)",
        vec![placed["id"].as_str().unwrap().to_string(), shelf.clone()],
    )
    .await;
    let r = ok(&s, &format!("shelf_id={shelf}")).await;
    assert_eq!(titles(&r), ["Sullo scaffale"]);
    assert_eq!(r["items"][0]["placement"]["shelf_id"], shelf.as_str());
    assert_eq!(titles(&ok(&s, "unshelved=true").await), ["In giro"]);
    assert_eq!(ok(&s, "unshelved=false").await["total"], 2);
    let (st, b) = list(&s, &format!("shelf_id={shelf}&unshelved=true")).await;
    assert_eq!(st, 422, "{b}");
    assert_eq!(b["error_code"], "validation");
}

#[tokio::test]
async fn on_loan_true_and_false() {
    let s = seed(Role::Owner, None, None).await;
    let lent = create(&s, json!({"title": "Prestato"})).await;
    let back = create(&s, json!({"title": "Restituito"})).await;
    create(&s, json!({"title": "Mai prestato"})).await;
    for (book, returned) in [(&lent, None), (&back, Some("50"))] {
        let (id, lib) = (uuid::Uuid::now_v7().to_string(), s.library_id.clone());
        let bid = book["id"].as_str().unwrap().to_string();
        let ret = returned.map(str::to_string);
        s.state
            .db
            .run(move |c| {
                c.execute(
                    "INSERT INTO loans (id, library_id, book_id, borrower_name, lent_at, returned_at) \
                     VALUES (?1, ?2, ?3, 'Marta', 10, ?4)",
                    rusqlite::params![id, lib, bid, ret],
                )
            })
            .await
            .unwrap();
    }
    let r = ok(&s, "on_loan=true").await;
    assert_eq!(titles(&r), ["Prestato"]);
    assert_eq!(r["items"][0]["on_loan"], true);
    let r = ok(&s, "on_loan=false").await;
    assert_eq!(r["total"], 2);
    assert!(!titles(&r).contains(&"Prestato".to_string()));
}

#[tokio::test]
async fn sort_by_title_author_year_progressive() {
    let s = seed(Role::Owner, None, None).await;
    create(
        &s,
        json!({"title": "banana", "authors": ["Zeta"], "published_year": 2000, "progressive_number": 3}),
    )
    .await;
    create(
        &s,
        json!({"title": "Cedro", "authors": ["alfa", "Omega"], "published_year": 1990, "progressive_number": 1}),
    )
    .await;
    create(&s, json!({"title": "Arancia"})).await;
    create(
        &s,
        json!({"title": "Dattero", "authors": ["Beta"], "published_year": 2010, "progressive_number": 2}),
    )
    .await;

    let t = |q: &str| {
        let q = q.to_string();
        let s = &s;
        async move { titles(&ok(s, &q).await) }
    };
    assert_eq!(
        t("sort=title").await,
        ["Arancia", "banana", "Cedro", "Dattero"]
    );
    assert_eq!(
        t("sort=title&order=desc").await,
        ["Dattero", "Cedro", "banana", "Arancia"]
    );
    // Authors: first author, case-insensitive, no author last in both orders.
    assert_eq!(
        t("sort=author").await,
        ["Cedro", "Dattero", "banana", "Arancia"]
    );
    assert_eq!(
        t("sort=author&order=desc").await,
        ["banana", "Dattero", "Cedro", "Arancia"]
    );
    assert_eq!(
        t("sort=year").await,
        ["Cedro", "banana", "Dattero", "Arancia"]
    );
    assert_eq!(
        t("sort=year&order=desc").await,
        ["Dattero", "banana", "Cedro", "Arancia"]
    );
    assert_eq!(
        t("sort=progressive").await,
        ["Cedro", "Dattero", "banana", "Arancia"]
    );
    assert_eq!(
        t("sort=progressive&order=desc").await,
        ["banana", "Dattero", "Cedro", "Arancia"]
    );
}

#[tokio::test]
async fn search_orders_by_relevance_then_explicit_sort() {
    let s = seed(Role::Owner, None, None).await;
    create(
        &s,
        json!({"title": "Zeta", "description": "rosa rosa rosa tra altre parole lunghe lunghe lunghe lunghe"}),
    )
    .await;
    create(&s, json!({"title": "Rosa"})).await;
    assert_eq!(titles(&ok(&s, "q=rosa").await), ["Rosa", "Zeta"]);
    assert_eq!(titles(&ok(&s, "q=rosa&sort=title").await), ["Rosa", "Zeta"]);
    assert_eq!(
        titles(&ok(&s, "q=rosa&sort=title&order=desc").await),
        ["Zeta", "Rosa"]
    );
}

#[tokio::test]
async fn invalid_parameters_are_validation() {
    let s = seed(Role::Owner, None, None).await;
    for q in [
        "sort=foo",
        "order=up",
        "format=tablet",
        "on_loan=maybe",
        "unshelved=maybe",
        "limit=0",
        "limit=201",
        "offset=-1",
        "limit=abc",
        "shelf_id=x&unshelved=true",
    ] {
        let (st, b) = list(&s, q).await;
        assert_eq!(st, 422, "{q}: {b}");
        assert_eq!(b["error_code"], "validation", "{q}");
    }
}

#[tokio::test]
async fn never_returns_another_library() {
    let s = seed(Role::Owner, None, None).await;
    let (other_lib, other) = other_library(&s.state).await;
    create(&s, json!({"title": "Mio libro"})).await;
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(&other.access_token),
        Some(json!({"title": "Libro segreto", "genre": "giallo"})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    let _ = other_lib;
    assert_eq!(titles(&ok(&s, "").await), ["Mio libro"]);
    let r = ok(&s, "q=segreto").await;
    assert_eq!(r["total"], 0);
    assert_eq!(ok(&s, "genre=giallo").await["total"], 0);
}

#[tokio::test]
async fn guest_can_list() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Uno"})).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/books",
        Some(&guest.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["total"], 1);
}

#[tokio::test]
async fn needs_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, b) = call(&s.state, "GET", "/api/v1/books", None, None).await;
    assert_eq!(st, 401, "{b}");
}

#[tokio::test]
async fn route_is_in_openapi() {
    let doc = bookeeper_core::openapi();
    let v = serde_json::to_value(&doc).unwrap();
    let params = v["paths"]["/api/v1/books"]["get"]["parameters"]
        .as_array()
        .expect("parameters");
    let names: Vec<&str> = params.iter().map(|p| p["name"].as_str().unwrap()).collect();
    for n in [
        "q",
        "genre",
        "language",
        "format",
        "shelf_id",
        "unshelved",
        "on_loan",
        "sort",
        "order",
        "limit",
        "offset",
    ] {
        assert!(names.contains(&n), "missing {n}");
    }
}

#[tokio::test]
async fn order_without_sort_on_a_search_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Zebra"})).await;
    let (st, b) = list(&s, "q=zebra&order=asc").await;
    assert_eq!((st, b["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn order_with_sort_on_a_search_is_honoured() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Zebra alfa"})).await;
    create(&s, json!({"title": "Zebra beta"})).await;
    assert_eq!(
        titles(&ok(&s, "q=zebra&sort=title&order=asc").await),
        ["Zebra alfa", "Zebra beta"]
    );
    assert_eq!(
        titles(&ok(&s, "q=zebra&sort=title&order=desc").await),
        ["Zebra beta", "Zebra alfa"]
    );
}

#[tokio::test]
async fn decomposed_accents_match_composed_text() {
    let s = seed(Role::Owner, None, None).await;
    create(&s, json!({"title": "Pérez", "authors": []})).await;
    create(&s, json!({"title": "Altro"})).await;
    let q = "Pe\u{0301}rez";
    let encoded: String = q.bytes().map(|b| format!("%{b:02X}")).collect();
    assert_eq!(titles(&ok(&s, &format!("q={encoded}")).await), ["Pérez"]);
}

// ---- Phase 4A filters ----

async fn id_of(s: &Seeded, title: &str, body: Value) -> String {
    let mut body = body;
    body["title"] = json!(title);
    create(s, body).await["id"].as_str().unwrap().to_string()
}

async fn make_tag(s: &Seeded, name: &str) -> String {
    let (st, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/tags",
        Some(&s.session.access_token),
        Some(json!({"name": name})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    b["id"].as_str().unwrap().to_string()
}

async fn tag_book(s: &Seeded, book: &str, tags: &[&String]) {
    let (st, _, b) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book}/tags"),
        Some(&s.session.access_token),
        Some(json!({"tag_ids": tags})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
}

async fn set_reading(s: &Seeded, token: &str, book: &str, body: Value) {
    let (st, _, b) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book}/reading"),
        Some(token),
        Some(body),
    )
    .await;
    assert_eq!(st, 200, "{b}");
}

/// A room with one shelf; returns (room_id, shelf_id).
async fn room_with_shelf(s: &Seeded, name: &str) -> (String, String) {
    let room = uuid::Uuid::now_v7().to_string();
    exec(
        s,
        "INSERT INTO rooms (id, library_id, name, created_at) VALUES (?1, ?2, ?3, 1)",
        vec![room.clone(), s.library_id.clone(), name.to_string()],
    )
    .await;
    let shelf = insert_shelf(&s.state, &s.library_id, name, 2, 10).await;
    exec(
        s,
        "UPDATE shelves SET room_id = ?1 WHERE id = ?2",
        vec![room.clone(), shelf.clone()],
    )
    .await;
    (room, shelf)
}

async fn place(s: &Seeded, book: &str, shelf: &str, slot: i64) {
    exec(
        s,
        "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at) \
         VALUES (?1, ?2, 0, ?3, 1)",
        vec![book.to_string(), shelf.to_string(), slot.to_string()],
    )
    .await;
}

#[tokio::test]
async fn genre_and_language_ignore_case() {
    let s = seed(Role::Owner, None, None).await;
    create(
        &s,
        json!({"title": "A", "genre": "Giallo", "language": "IT"}),
    )
    .await;
    create(
        &s,
        json!({"title": "B", "genre": "giallo", "language": "en"}),
    )
    .await;
    create(&s, json!({"title": "C", "genre": "Saggio"})).await;
    assert_eq!(ok(&s, "genre=GIALLO&sort=title").await["total"], 2);
    assert_eq!(titles(&ok(&s, "language=it").await), ["A"]);
}

#[tokio::test]
async fn reading_filter_is_the_callers_own() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let a = id_of(&s, "A", json!({})).await;
    let b = id_of(&s, "B", json!({})).await;
    let _c = id_of(&s, "C", json!({})).await;
    set_reading(&s, &s.session.access_token, &a, json!({"status": "read"})).await;
    set_reading(
        &s,
        &s.session.access_token,
        &b,
        json!({"status": "to_read"}),
    )
    .await;
    set_reading(&s, &other.access_token, &b, json!({"status": "read"})).await;
    assert_eq!(titles(&ok(&s, "reading=read").await), ["A"]);
    assert_eq!(titles(&ok(&s, "reading=to_read").await), ["B"]);
    assert_eq!(ok(&s, "reading=abandoned").await["total"], 0);
    assert_eq!(titles(&ok(&s, "reading=none").await), ["C"]);
    let (st, _, r) = call(
        &s.state,
        "GET",
        "/api/v1/books?reading=read&sort=title",
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(titles(&r), ["B"]);
    let (_, _, r) = call(
        &s.state,
        "GET",
        "/api/v1/books?reading=none&sort=title",
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(titles(&r), ["A", "C"]);
}

#[tokio::test]
async fn tag_id_repeated_requires_all_tags() {
    let s = seed(Role::Owner, None, None).await;
    let (t1, t2, t3) = (
        make_tag(&s, "uno").await,
        make_tag(&s, "due").await,
        make_tag(&s, "tre").await,
    );
    let a = id_of(&s, "A", json!({})).await;
    let b = id_of(&s, "B", json!({})).await;
    let c = id_of(&s, "C", json!({})).await;
    tag_book(&s, &a, &[&t1, &t2]).await;
    tag_book(&s, &b, &[&t1]).await;
    tag_book(&s, &c, &[&t2, &t3]).await;
    assert_eq!(
        titles(&ok(&s, &format!("tag_id={t1}&sort=title")).await),
        ["A", "B"]
    );
    let both = ok(&s, &format!("tag_id={t1}&tag_id={t2}")).await;
    assert_eq!(titles(&both), ["A"]);
    assert_eq!(both["total"], 1);
    assert_eq!(
        ok(&s, &format!("tag_id={t1}&tag_id={t3}")).await["total"],
        0
    );
    // Same tag twice is the same as once.
    assert_eq!(
        ok(&s, &format!("tag_id={t1}&tag_id={t1}")).await["total"],
        2
    );
    assert_eq!(ok(&s, "tag_id=nope").await["total"], 0);
}

#[tokio::test]
async fn more_than_ten_tags_is_validation() {
    let s = seed(Role::Owner, None, None).await;
    let ten: Vec<String> = (0..10).map(|i| format!("tag_id=t{i}")).collect();
    assert_eq!(ok(&s, &ten.join("&")).await["total"], 0);
    let eleven: Vec<String> = (0..11).map(|i| format!("tag_id=t{i}")).collect();
    let (st, b) = list(&s, &eleven.join("&")).await;
    assert_eq!(st, 422, "{b}");
    assert_eq!(b["error_code"], "validation");
}

#[tokio::test]
async fn room_id_matches_books_on_its_shelves() {
    let s = seed(Role::Owner, None, None).await;
    let (r1, s1) = room_with_shelf(&s, "Salotto").await;
    let (r2, s2) = room_with_shelf(&s, "Studio").await;
    let s1b = insert_shelf(&s.state, &s.library_id, "Altro", 1, 5).await;
    exec(
        &s,
        "UPDATE shelves SET room_id = ?1 WHERE id = ?2",
        vec![r1.clone(), s1b.clone()],
    )
    .await;
    let a = id_of(&s, "A", json!({})).await;
    let b = id_of(&s, "B", json!({})).await;
    let c = id_of(&s, "C", json!({})).await;
    let _d = id_of(&s, "D", json!({})).await;
    place(&s, &a, &s1, 0).await;
    place(&s, &b, &s1b, 0).await;
    place(&s, &c, &s2, 0).await;
    assert_eq!(
        titles(&ok(&s, &format!("room_id={r1}&sort=title")).await),
        ["A", "B"]
    );
    assert_eq!(titles(&ok(&s, &format!("room_id={r2}")).await), ["C"]);
    assert_eq!(ok(&s, "room_id=nope").await["total"], 0);
    assert_eq!(
        titles(&ok(&s, &format!("room_id={r1}&shelf_id={s1b}")).await),
        ["B"]
    );
}

#[tokio::test]
async fn ranges_are_inclusive_and_inverted_ranges_fail() {
    let s = seed(Role::Owner, None, None).await;
    for (t, y, a) in [("A", 1990, 100), ("B", 2000, 200), ("C", 2010, 300)] {
        create(
            &s,
            json!({"title": t, "published_year": y, "acquired_at": a}),
        )
        .await;
    }
    create(&s, json!({"title": "N"})).await;
    let t = |q: &'static str| {
        let s = &s;
        async move {
            let mut v = titles(&ok(s, &format!("{q}&sort=title")).await);
            v.sort();
            v
        }
    };
    assert_eq!(t("year_from=2000").await, ["B", "C"]);
    assert_eq!(t("year_to=2000").await, ["A", "B"]);
    assert_eq!(t("year_from=2000&year_to=2000").await, ["B"]);
    assert_eq!(t("acquired_from=200").await, ["B", "C"]);
    assert_eq!(t("acquired_to=200").await, ["A", "B"]);
    assert_eq!(t("acquired_from=200&acquired_to=200").await, ["B"]);
    for q in [
        "year_from=2001&year_to=2000",
        "acquired_from=2&acquired_to=1",
        "year_from=abc",
        "acquired_to=x",
        "reading=finished",
    ] {
        let (st, b) = list(&s, q).await;
        assert_eq!(st, 422, "{q}: {b}");
        assert_eq!(b["error_code"], "validation");
    }
}

#[tokio::test]
async fn new_sorts_put_missing_values_last_both_ways() {
    let s = seed(Role::Owner, None, None).await;
    let a = id_of(&s, "A", json!({"acquired_at": 30, "page_count": 300, "published_year": 2001, "progressive_number": 2})).await;
    let b = id_of(&s, "B", json!({"acquired_at": 10, "page_count": 100, "published_year": 2003, "progressive_number": 1})).await;
    let _c = id_of(&s, "C", json!({})).await;
    let d = id_of(&s, "D", json!({"acquired_at": 20, "page_count": 200, "published_year": 2002, "progressive_number": 3})).await;
    set_reading(
        &s,
        &s.session.access_token,
        &a,
        json!({"status": "read", "rating": 5}),
    )
    .await;
    set_reading(
        &s,
        &s.session.access_token,
        &b,
        json!({"status": "read", "rating": 2}),
    )
    .await;
    set_reading(
        &s,
        &s.session.access_token,
        &d,
        json!({"status": "reading"}),
    )
    .await;
    let t = |q: &'static str| {
        let s = &s;
        async move { titles(&ok(s, q).await) }
    };
    for (key, asc, desc) in [
        ("acquired_at", ["B", "D", "A", "C"], ["A", "D", "B", "C"]),
        ("page_count", ["B", "D", "A", "C"], ["A", "D", "B", "C"]),
        ("published_year", ["A", "D", "B", "C"], ["B", "D", "A", "C"]),
        (
            "progressive_number",
            ["B", "A", "D", "C"],
            ["D", "A", "B", "C"],
        ),
    ] {
        let q: &'static str = Box::leak(format!("sort={key}").into_boxed_str());
        assert_eq!(t(q).await, asc, "{key}");
        let q: &'static str = Box::leak(format!("sort={key}&order=desc").into_boxed_str());
        assert_eq!(t(q).await, desc, "{key} desc");
    }
    // Rating: no rating (D has a state without rating, C has none) last, ties by id.
    assert_eq!(t("sort=rating").await, ["B", "A", "C", "D"]);
    assert_eq!(t("sort=rating&order=desc").await, ["A", "B", "D", "C"]);
    // Ties fall back to id: A, B, C, D were created in that order.
    create(&s, json!({"title": "E"})).await;
    assert_eq!(t("sort=page_count").await.last().unwrap(), "E");
}

#[tokio::test]
async fn rating_sort_uses_the_callers_ratings() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    let a = id_of(&s, "A", json!({})).await;
    let b = id_of(&s, "B", json!({})).await;
    set_reading(
        &s,
        &s.session.access_token,
        &a,
        json!({"status": "read", "rating": 1}),
    )
    .await;
    set_reading(
        &s,
        &other.access_token,
        &a,
        json!({"status": "read", "rating": 5}),
    )
    .await;
    set_reading(
        &s,
        &s.session.access_token,
        &b,
        json!({"status": "read", "rating": 4}),
    )
    .await;
    assert_eq!(titles(&ok(&s, "sort=rating&order=desc").await), ["B", "A"]);
    let (_, _, r) = call(
        &s.state,
        "GET",
        "/api/v1/books?sort=rating&order=desc",
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(titles(&r), ["A", "B"]);
}

#[tokio::test]
async fn filters_combine_with_tags_rooms_reading_and_years() {
    let s = seed(Role::Owner, None, None).await;
    let t = make_tag(&s, "cult").await;
    let (room, shelf) = room_with_shelf(&s, "Salotto").await;
    let mut want = None;
    for (i, (title, year, tagged, placed, state)) in [
        ("ok", 2005, true, true, Some("read")),
        ("year", 1999, true, true, Some("read")),
        ("tag", 2005, false, true, Some("read")),
        ("room", 2005, true, false, Some("read")),
        ("state", 2005, true, true, None),
    ]
    .into_iter()
    .enumerate()
    {
        let id = id_of(&s, title, json!({"published_year": year})).await;
        if tagged {
            tag_book(&s, &id, &[&t]).await;
        }
        if placed {
            place(&s, &id, &shelf, i as i64).await;
        }
        if let Some(st) = state {
            set_reading(&s, &s.session.access_token, &id, json!({"status": st})).await;
        }
        if title == "ok" {
            want = Some(id);
        }
    }
    let r = ok(
        &s,
        &format!("tag_id={t}&room_id={room}&reading=read&year_from=2000&year_to=2010"),
    )
    .await;
    assert_eq!(ids(&r), [want.unwrap()]);
    assert_eq!(r["total"], 1);
}

#[tokio::test]
async fn filters_and_sorts_apply_inside_full_text_search() {
    let s = seed(Role::Owner, None, None).await;
    let t = make_tag(&s, "x").await;
    let (room, shelf) = room_with_shelf(&s, "Salotto").await;
    let mut tagged = Vec::new();
    for (title, year, pages) in [
        ("Rosa antica", 1990, 300),
        ("Rosa nuova", 2010, 100),
        ("Rosa media", 2000, 200),
        ("Rosa", 2000, 50),
    ] {
        let id = id_of(
            &s,
            title,
            json!({"published_year": year, "page_count": pages, "genre": "Storia"}),
        )
        .await;
        tagged.push(id);
    }
    id_of(&s, "Altro", json!({"published_year": 2000})).await;
    for (i, id) in tagged.iter().take(3).enumerate() {
        tag_book(&s, id, &[&t]).await;
        place(&s, id, &shelf, i as i64).await;
    }
    set_reading(
        &s,
        &s.session.access_token,
        &tagged[0],
        json!({"status": "read"}),
    )
    .await;
    set_reading(
        &s,
        &s.session.access_token,
        &tagged[1],
        json!({"status": "read"}),
    )
    .await;
    let q = format!(
        "q=rosa&tag_id={t}&room_id={room}&reading=read&genre=storia&year_from=1990&year_to=2010&sort=page_count&order=desc"
    );
    let r = ok(&s, &q).await;
    assert_eq!(titles(&r), ["Rosa antica", "Rosa nuova"]);
    assert_eq!(r["total"], 2);
    let r = ok(&s, "q=rosa&reading=none&sort=title").await;
    assert_eq!(titles(&r), ["Rosa", "Rosa media"]);
    let r = ok(&s, "q=rosa&year_from=2000&sort=year").await;
    assert_eq!(titles(&r), ["Rosa media", "Rosa", "Rosa nuova"]);
    assert_eq!(ok(&s, "q=rosa&limit=1&reading=none").await["total"], 2);
}

#[tokio::test]
async fn total_respects_filters_and_unknown_parameters_are_ignored() {
    let s = seed(Role::Owner, None, None).await;
    for i in 0..5 {
        create(
            &s,
            json!({"title": format!("L{i}"), "published_year": 2000 + i}),
        )
        .await;
    }
    let r = ok(&s, "year_from=2002&limit=1&offset=1").await;
    assert_eq!(r["total"], 3);
    assert_eq!(r["items"].as_array().unwrap().len(), 1);
    assert_eq!(ok(&s, "pippo=1&tag_id_x=2").await["total"], 5);
}

#[tokio::test]
async fn new_filters_do_not_cross_libraries() {
    let s = seed(Role::Owner, None, None).await;
    let (_, other) = other_library(&s.state).await;
    let t = make_tag(&s, "mio").await;
    let a = id_of(&s, "Mio", json!({})).await;
    tag_book(&s, &a, &[&t]).await;
    let (_, _, r) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books?tag_id={t}"),
        Some(&other.access_token),
        None,
    )
    .await;
    assert_eq!(r["total"], 0);
}

#[tokio::test]
async fn filtered_list_of_ten_thousand_books_is_fast() {
    let s = seed(Role::Owner, None, None).await;
    let t = make_tag(&s, "perf").await;
    let lib = s.library_id.clone();
    let tag = t.clone();
    s.state
        .db
        .run(move |c| {
            let tx = c.unchecked_transaction()?;
            for i in 0..10_000i64 {
                let id = format!("perf-{i:06}");
                tx.execute(
                    "INSERT INTO books (id, library_id, title, authors_json, published_year, \
                     genre, page_count, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, '[\"Autore\"]', ?4, 'Romanzo', ?5, ?6, ?6)",
                    rusqlite::params![
                        id,
                        lib,
                        format!("Titolo {i}"),
                        1900 + i % 120,
                        100 + i % 500,
                        i
                    ],
                )?;
                if i % 3 == 0 {
                    tx.execute(
                        "INSERT INTO book_tags (book_id, tag_id) VALUES (?1, ?2)",
                        rusqlite::params![id, tag],
                    )?;
                }
            }
            tx.commit()
        })
        .await
        .unwrap();
    let start = std::time::Instant::now();
    let r = ok(
        &s,
        &format!("tag_id={t}&reading=none&year_from=1950&year_to=2000&genre=romanzo&sort=page_count&limit=50"),
    )
    .await;
    let took = start.elapsed();
    assert!(r["total"].as_i64().unwrap() > 0);
    assert!(took.as_millis() < 300, "took {took:?}");
}

#[tokio::test]
async fn genre_and_language_ignore_case_beyond_ascii() {
    let s = seed(Role::Owner, None, None).await;
    create(
        &s,
        json!({"title": "A", "genre": "Ética", "language": "ÉS"}),
    )
    .await;
    create(&s, json!({"title": "B", "genre": "Saggio"})).await;
    assert_eq!(titles(&ok(&s, "genre=%C3%A9tica").await), ["A"]);
    assert_eq!(titles(&ok(&s, "genre=%C3%89TICA").await), ["A"]);
    assert_eq!(titles(&ok(&s, "language=%C3%A9s").await), ["A"]);
}
