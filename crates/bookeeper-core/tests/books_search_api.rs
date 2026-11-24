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
