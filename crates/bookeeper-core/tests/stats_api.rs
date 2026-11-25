mod common;

use bookeeper_core::api::stats::{compute, Stats};
use bookeeper_core::auth::guard::AuthUser;
use bookeeper_core::auth::Role;
use chrono::{TimeZone, Utc};
use common::*;

fn ts(y: i32, m: u32, d: u32) -> i64 {
    Utc.with_ymd_and_hms(y, m, d, 0, 0, 0).unwrap().timestamp()
}

/// 2026-03-15T12:00:00Z
fn now() -> i64 {
    Utc.with_ymd_and_hms(2026, 3, 15, 12, 0, 0)
        .unwrap()
        .timestamp()
}

fn who(s: &Seeded) -> AuthUser {
    AuthUser {
        library_id: s.library_id.clone(),
        user_id: s.user_id.clone(),
        device_id: "d".into(),
        role: Role::Owner,
    }
}

async fn stats_at(s: &Seeded, now: i64) -> Stats {
    let w = who(s);
    s.state.db.run(move |c| compute(c, &w, now)).await.unwrap()
}

async fn exec(s: &Seeded, sql: &str, args: Vec<rusqlite::types::Value>) {
    let sql = sql.to_string();
    s.state
        .db
        .run(move |c| c.execute(&sql, rusqlite::params_from_iter(args)))
        .await
        .unwrap();
}

struct B<'a> {
    title: &'a str,
    authors: &'a str,
    pages: Option<i64>,
    format: Option<&'a str>,
    genre: Option<&'a str>,
    year: Option<i64>,
    created: i64,
}

fn b(title: &str) -> B<'_> {
    B {
        title,
        authors: "[]",
        pages: None,
        format: None,
        genre: None,
        year: None,
        created: now(),
    }
}

async fn add(s: &Seeded, lib: &str, x: B<'_>) -> String {
    use rusqlite::types::Value as V;
    let id = uuid::Uuid::now_v7().to_string();
    let opt = |o: Option<&str>| o.map_or(V::Null, |v| V::Text(v.into()));
    exec(
        s,
        "INSERT INTO books (id, library_id, title, authors_json, page_count, format, genre,
                            published_year, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        vec![
            V::Text(id.clone()),
            V::Text(lib.into()),
            V::Text(x.title.into()),
            V::Text(x.authors.into()),
            x.pages.map_or(V::Null, V::Integer),
            opt(x.format),
            opt(x.genre),
            x.year.map_or(V::Null, V::Integer),
            V::Integer(x.created),
        ],
    )
    .await;
    id
}

async fn loan(s: &Seeded, book: &str, lent: i64, due: Option<i64>, ret: Option<i64>) {
    use rusqlite::types::Value as V;
    exec(
        s,
        "INSERT INTO loans (id, library_id, book_id, borrower_name, lent_at, due_at, returned_at)
         VALUES (?1, ?2, ?3, 'Marta', ?4, ?5, ?6)",
        vec![
            V::Text(uuid::Uuid::now_v7().to_string()),
            V::Text(s.library_id.clone()),
            V::Text(book.into()),
            V::Integer(lent),
            due.map_or(V::Null, V::Integer),
            ret.map_or(V::Null, V::Integer),
        ],
    )
    .await;
}

async fn wish(s: &Seeded, user: &str, title: &str) {
    use rusqlite::types::Value as V;
    exec(
        s,
        "INSERT INTO wishlist (id, library_id, user_id, title, created_at) VALUES (?1, ?2, ?3, ?4, 1)",
        vec![
            V::Text(uuid::Uuid::now_v7().to_string()),
            V::Text(s.library_id.clone()),
            V::Text(user.into()),
            V::Text(title.into()),
        ],
    )
    .await;
}

fn pairs(v: &[bookeeper_core::api::stats::CountBy]) -> Vec<(String, i64)> {
    v.iter().map(|c| (c.key.clone(), c.count)).collect()
}

#[tokio::test]
async fn empty_library_is_all_zeros_with_twelve_months() {
    let s = seed(Role::Owner, None, None).await;
    let st = stats_at(&s, now()).await;
    let o = &st.overview;
    assert_eq!(
        [
            o.total_books,
            o.total_authors,
            o.total_shelves,
            o.total_pages,
            o.wishlist_count,
            o.active_loans,
            o.overdue_loans,
            o.returned_loans
        ],
        [0; 8]
    );
    assert!(st.by_format.is_empty() && st.by_language.is_empty() && st.by_genre.is_empty());
    assert!(st.by_decade.is_empty() && st.top_authors.is_empty() && st.shelf_fill.is_empty());
    assert_eq!(st.additions_by_month.len(), 12);
    assert_eq!(st.loans_by_month.len(), 12);
    assert!(st.additions_by_month.iter().all(|m| m.count == 0));
    assert!(st
        .loans_by_month
        .iter()
        .all(|m| m.lent == 0 && m.returned == 0));
}

#[tokio::test]
async fn overview_counts() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    let b1 = add(
        &s,
        &l,
        B {
            pages: Some(100),
            ..b("A")
        },
    )
    .await;
    let b2 = add(
        &s,
        &l,
        B {
            pages: Some(250),
            ..b("B")
        },
    )
    .await;
    let b3 = add(&s, &l, b("C")).await;
    insert_shelf(&s.state, &l, "S1", 2, 5).await;
    insert_shelf(&s.state, &l, "S2", 2, 5).await;
    loan(&s, &b1, ts(2026, 1, 1), Some(ts(2026, 2, 1)), None).await; // overdue
    loan(&s, &b2, ts(2026, 3, 1), Some(ts(2026, 4, 1)), None).await; // active
    loan(&s, &b3, ts(2026, 1, 1), None, Some(ts(2026, 2, 1))).await; // returned
    let o = stats_at(&s, now()).await.overview;
    assert_eq!(o.total_books, 3);
    assert_eq!(o.total_pages, 350);
    assert_eq!(o.total_shelves, 2);
    assert_eq!(o.active_loans, 2);
    assert_eq!(o.overdue_loans, 1);
    assert_eq!(o.returned_loans, 1);
}

#[tokio::test]
async fn authors_are_distinct_ignoring_case_and_spaces() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    add(
        &s,
        &l,
        B {
            authors: r#"["Umberto Eco"]"#,
            ..b("A")
        },
    )
    .await;
    add(
        &s,
        &l,
        B {
            authors: r#"[" umberto eco "]"#,
            ..b("B")
        },
    )
    .await;
    add(
        &s,
        &l,
        B {
            authors: r#"["Italo Calvino"]"#,
            ..b("C")
        },
    )
    .await;
    assert_eq!(stats_at(&s, now()).await.overview.total_authors, 2);
}

#[tokio::test]
async fn wishlist_count_is_personal() {
    let s = seed(Role::Owner, None, None).await;
    let (other, _) = add_user(&s.state, &s.library_id, Role::Member, "Bob").await;
    wish(&s, &s.user_id, "Mine").await;
    wish(&s, &s.user_id, "Mine 2").await;
    wish(&s, &other, "Theirs").await;
    assert_eq!(stats_at(&s, now()).await.overview.wishlist_count, 2);
}

#[tokio::test]
async fn by_format_orders_by_count_and_puts_missing_last() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    for _ in 0..3 {
        add(
            &s,
            &l,
            B {
                format: None,
                ..b("x")
            },
        )
        .await;
    }
    for _ in 0..2 {
        add(
            &s,
            &l,
            B {
                format: Some("paperback"),
                ..b("x")
            },
        )
        .await;
    }
    add(
        &s,
        &l,
        B {
            format: Some("ebook"),
            ..b("x")
        },
    )
    .await;
    add(
        &s,
        &l,
        B {
            format: Some("hardcover"),
            ..b("x")
        },
    )
    .await;
    let st = stats_at(&s, now()).await;
    assert_eq!(
        pairs(&st.by_format),
        vec![
            ("paperback".into(), 2),
            ("ebook".into(), 1),
            ("hardcover".into(), 1),
            ("".into(), 3)
        ]
    );
}

#[tokio::test]
async fn by_genre_caps_at_twenty_and_sums_the_rest() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    // genre i has (30 - i) books
    for i in 0..23 {
        let g = format!("g{i:02}");
        for _ in 0..(30 - i) {
            add(
                &s,
                &l,
                B {
                    genre: Some(&g),
                    ..b("x")
                },
            )
            .await;
        }
    }
    let st = stats_at(&s, now()).await;
    assert_eq!(st.by_genre.len(), 21);
    assert_eq!(st.by_genre[0].key, "g00");
    let last = st.by_genre.last().unwrap();
    assert_eq!(last.key, "…");
    assert_eq!(last.count, (30 - 20) + (30 - 21) + (30 - 22));
}

#[tokio::test]
async fn by_decade_buckets_and_skips_missing_years() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    for y in [Some(1980), Some(1989), Some(1990), None] {
        add(&s, &l, B { year: y, ..b("x") }).await;
    }
    let st = stats_at(&s, now()).await;
    assert_eq!(
        pairs(&st.by_decade),
        vec![("1980".into(), 2), ("1990".into(), 1)]
    );
}

#[tokio::test]
async fn additions_by_month_covers_the_last_twelve_months() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    add(
        &s,
        &l,
        B {
            created: ts(2025, 2, 10),
            ..b("old")
        },
    )
    .await;
    add(
        &s,
        &l,
        B {
            created: ts(2025, 4, 1),
            ..b("first")
        },
    )
    .await;
    add(
        &s,
        &l,
        B {
            created: ts(2026, 3, 1),
            ..b("edge")
        },
    )
    .await;
    let st = stats_at(&s, now()).await;
    let m = &st.additions_by_month;
    assert_eq!(m.len(), 12);
    assert_eq!(m[0].ym, "2025-04");
    assert_eq!(m[11].ym, "2026-03");
    assert_eq!(m[0].count, 1);
    assert_eq!(m[11].count, 1);
    assert_eq!(m.iter().map(|x| x.count).sum::<i64>(), 2);
}

#[tokio::test]
async fn loans_by_month_counts_lent_and_returned_separately() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    let b1 = add(&s, &l, b("a")).await;
    let b2 = add(&s, &l, b("b")).await;
    loan(&s, &b1, ts(2026, 1, 5), None, Some(ts(2026, 2, 5))).await;
    loan(&s, &b2, ts(2026, 2, 7), None, None).await;
    let m = stats_at(&s, now()).await.loans_by_month;
    let get = |ym: &str| m.iter().find(|x| x.ym == ym).unwrap().clone();
    assert_eq!((get("2026-01").lent, get("2026-01").returned), (1, 0));
    assert_eq!((get("2026-02").lent, get("2026-02").returned), (1, 1));
    assert_eq!((get("2026-03").lent, get("2026-03").returned), (0, 0));
}

#[tokio::test]
async fn top_authors_is_capped_at_ten_and_ordered() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    for i in 0..12 {
        let a = format!(r#"["Autore {i:02}"]"#);
        add(
            &s,
            &l,
            B {
                authors: &a,
                ..b("x")
            },
        )
        .await;
    }
    // "Zeta" has most books, mixed spelling; the most frequent spelling is shown.
    for a in [r#"["Zeta"]"#, r#"["Zeta"]"#, r#"["ZETA"]"#] {
        add(
            &s,
            &l,
            B {
                authors: a,
                ..b("x")
            },
        )
        .await;
    }
    let top = stats_at(&s, now()).await.top_authors;
    assert_eq!(top.len(), 10);
    assert_eq!((top[0].key.as_str(), top[0].count), ("Zeta", 3));
    assert_eq!(top[1].key, "Autore 00");
    assert_eq!(top[9].key, "Autore 08");
}

#[tokio::test]
async fn shelf_fill_percentages() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    let full = insert_shelf(&s.state, &l, "Piena", 2, 5).await;
    insert_shelf(&s.state, &l, "Vuota", 2, 5).await;
    for i in 0..3 {
        let id = add(&s, &l, b("x")).await;
        use rusqlite::types::Value as V;
        exec(
            &s,
            "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at)
             VALUES (?1, ?2, 0, ?3, 1)",
            vec![V::Text(id), V::Text(full.clone()), V::Integer(i)],
        )
        .await;
    }
    let f = stats_at(&s, now()).await.shelf_fill;
    assert_eq!(f.len(), 2);
    assert_eq!((f[0].used, f[0].capacity), (3, 10));
    assert_eq!(f[0].pct, 0.3);
    assert_eq!((f[1].used, f[1].pct), (0, 0.0));
}

#[tokio::test]
async fn never_counts_another_library() {
    let s = seed(Role::Owner, None, None).await;
    let (other, _) = other_library(&s.state).await;
    let before = serde_json::to_value(stats_at(&s, now()).await).unwrap();
    let ob = add(
        &s,
        &other,
        B {
            authors: r#"["X"]"#,
            format: Some("ebook"),
            genre: Some("g"),
            year: Some(1990),
            pages: Some(10),
            ..b("o")
        },
    )
    .await;
    insert_shelf(&s.state, &other, "S", 2, 5).await;
    use rusqlite::types::Value as V;
    exec(
        &s,
        "INSERT INTO loans (id, library_id, book_id, borrower_name, lent_at) VALUES ('l', ?1, ?2, 'x', ?3)",
        vec![V::Text(other.clone()), V::Text(ob), V::Integer(now())],
    )
    .await;
    let after = serde_json::to_value(stats_at(&s, now()).await).unwrap();
    assert_eq!(before, after);
}

#[tokio::test]
async fn guest_can_read() {
    let s = seed(Role::Guest, None, None).await;
    let (st, _, _) = call(
        &s.state,
        "GET",
        "/api/v1/stats",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn needs_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, _) = call(&s.state, "GET", "/api/v1/stats", None, None).await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn route_returns_the_same_shape() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/stats",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    for k in [
        "overview",
        "by_format",
        "by_language",
        "by_genre",
        "by_decade",
        "additions_by_month",
        "loans_by_month",
        "top_authors",
        "shelf_fill",
    ] {
        assert!(body.get(k).is_some(), "missing {k}");
    }
    assert_eq!(body["additions_by_month"].as_array().unwrap().len(), 12);
}

#[tokio::test]
async fn top_authors_counts_each_book_once_per_author() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    add(
        &s,
        &l,
        B {
            authors: r#"["Umberto Eco", "umberto eco"]"#,
            ..b("A")
        },
    )
    .await;
    let top = stats_at(&s, now()).await.top_authors;
    assert_eq!(pairs(&top), vec![("Umberto Eco".to_string(), 1)]);
}

#[tokio::test]
async fn total_authors_ignores_duplicate_spellings_in_one_book() {
    let s = seed(Role::Owner, None, None).await;
    let l = s.library_id.clone();
    add(
        &s,
        &l,
        B {
            authors: r#"["Umberto Eco", " UMBERTO ECO ", "Italo Calvino"]"#,
            ..b("A")
        },
    )
    .await;
    assert_eq!(stats_at(&s, now()).await.overview.total_authors, 2);
}
