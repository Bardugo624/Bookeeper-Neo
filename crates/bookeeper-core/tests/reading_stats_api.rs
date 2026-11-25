mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

/// 2024-01-01T00:00:00Z
const Y24: i64 = 1_704_067_200;
const DAY: i64 = 86_400;

async fn book(s: &Seeded, title: &str, genre: Option<&str>, pages: Option<i64>) -> String {
    let id = insert_book(&s.state, &s.library_id, title).await;
    let (b, g) = (id.clone(), genre.map(String::from));
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET genre = ?2, page_count = ?3 WHERE id = ?1",
                rusqlite::params![b, g, pages],
            )
        })
        .await
        .unwrap();
    id
}

async fn read_row(
    s: &Seeded,
    user: &str,
    book: &str,
    status: &str,
    fin: Option<i64>,
    rating: Option<i64>,
) {
    let (u, b, st) = (user.to_string(), book.to_string(), status.to_string());
    let lib = s.library_id.clone();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO reading (id, library_id, user_id, book_id, status, finished_at, rating, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
                rusqlite::params![uuid::Uuid::now_v7().to_string(), lib, u, b, st, fin, rating],
            )
        })
        .await
        .unwrap();
}

async fn stats(s: &Seeded, token: &str, q: &str) -> (u16, Value) {
    let (st, _, b) = call(
        &s.state,
        "GET",
        &format!("/api/v1/stats/reading{q}"),
        Some(token),
        None,
    )
    .await;
    (st, b)
}

#[tokio::test]
async fn empty_year_is_zeroes() {
    let s = seed(Role::Owner, None, None).await;
    let (st, b) = stats(&s, &s.session.access_token, "?year=2020").await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["years"], json!([]));
    let y = &b["year"];
    assert_eq!(y["year"], 2020);
    assert_eq!(
        (y["books"].as_i64(), y["pages"].as_i64()),
        (Some(0), Some(0))
    );
    assert_eq!(y["by_month"], json!(vec![0; 12]));
    assert_eq!(y["by_genre"], json!([]));
    assert_eq!(y["days"], json!([]));
    assert_eq!(y["rated"], json!({"count": 0, "average": null}));
    assert!(y["longest"].is_null());
}

#[tokio::test]
async fn default_year_is_current() {
    let s = seed(Role::Owner, None, None).await;
    let (_, b) = stats(&s, &s.session.access_token, "").await;
    let cur = chrono::Datelike::year(&chrono::Utc::now()) as i64;
    assert_eq!(b["year"]["year"], cur);
}

#[tokio::test]
async fn new_year_boundary_utc_and_years_list() {
    let s = seed(Role::Owner, None, None).await;
    let (a, b, c) = (
        book(&s, "A", None, Some(100)).await,
        book(&s, "B", None, Some(200)).await,
        book(&s, "C", None, None).await,
    );
    read_row(&s, &s.user_id, &a, "read", Some(Y24 - 1), None).await; // 2023-12-31 23:59:59
    read_row(&s, &s.user_id, &b, "read", Some(Y24), None).await; // 2024-01-01 00:00:00
    read_row(&s, &s.user_id, &c, "read", Some(Y24 + 10 * DAY), None).await;
    let t = &s.session.access_token;
    let (_, r) = stats(&s, t, "?year=2024").await;
    assert_eq!(
        r["years"],
        json!([{"year": 2024, "books": 2, "pages": 200}, {"year": 2023, "books": 1, "pages": 100}])
    );
    assert_eq!(r["year"]["books"], 2);
    assert_eq!(r["year"]["pages"], 200);
    let (_, r) = stats(&s, t, "?year=2023").await;
    assert_eq!(r["year"]["books"], 1);
    assert_eq!(r["year"]["by_month"][11], 1);
    assert_eq!(
        r["year"]["days"],
        json!([{"date": "2023-12-31", "books": 1}])
    );
}

#[tokio::test]
async fn by_month_days_and_non_read_ignored() {
    let s = seed(Role::Owner, None, None).await;
    let ids = [
        book(&s, "A", None, None).await,
        book(&s, "B", None, None).await,
        book(&s, "C", None, None).await,
        book(&s, "D", None, None).await,
        book(&s, "E", None, None).await,
    ];
    read_row(&s, &s.user_id, &ids[0], "read", Some(Y24 + 3600), None).await;
    read_row(&s, &s.user_id, &ids[1], "read", Some(Y24 + 7200), None).await;
    read_row(&s, &s.user_id, &ids[2], "read", Some(Y24 + 40 * DAY), None).await; // 2024-02-10
    read_row(&s, &s.user_id, &ids[3], "reading", Some(Y24 + DAY), None).await;
    read_row(&s, &s.user_id, &ids[4], "read", None, None).await;
    let (_, r) = stats(&s, &s.session.access_token, "?year=2024").await;
    let y = &r["year"];
    assert_eq!(y["books"], 3);
    assert_eq!(y["by_month"], json!([2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    assert_eq!(
        y["days"],
        json!([{"date": "2024-01-01", "books": 2}, {"date": "2024-02-10", "books": 1}])
    );
}

#[tokio::test]
async fn genres_case_insensitive_with_missing() {
    let s = seed(Role::Owner, None, None).await;
    let specs = [
        Some("Fantasy"),
        Some("fantasy"),
        Some("Fantasy"),
        Some("Giallo"),
        None,
        Some("  "),
    ];
    for (i, g) in specs.iter().enumerate() {
        let id = book(&s, &format!("B{i}"), *g, None).await;
        read_row(&s, &s.user_id, &id, "read", Some(Y24 + i as i64), None).await;
    }
    let (_, r) = stats(&s, &s.session.access_token, "?year=2024").await;
    assert_eq!(
        r["year"]["by_genre"],
        json!([
            {"value": "Fantasy", "count": 3},
            {"value": "Giallo", "count": 1},
            {"value": null, "count": 2}
        ])
    );
}

#[tokio::test]
async fn pages_ratings_longest() {
    let s = seed(Role::Owner, None, None).await;
    let a = book(&s, "Short", None, Some(100)).await;
    let b = book(&s, "Long", None, Some(500)).await;
    let c = book(&s, "NoPages", None, None).await;
    read_row(&s, &s.user_id, &a, "read", Some(Y24 + 1), Some(4)).await;
    read_row(&s, &s.user_id, &b, "read", Some(Y24 + 2), Some(5)).await;
    read_row(&s, &s.user_id, &c, "read", Some(Y24 + 3), None).await;
    let (_, r) = stats(&s, &s.session.access_token, "?year=2024").await;
    let y = &r["year"];
    assert_eq!(y["pages"], 600);
    assert_eq!(y["rated"], json!({"count": 2, "average": 4.5}));
    assert_eq!(
        y["longest"],
        json!({"book_id": b, "title": "Long", "page_count": 500})
    );
    // one decimal
    let d = book(&s, "D", None, None).await;
    read_row(&s, &s.user_id, &d, "read", Some(Y24 + 4), Some(4)).await;
    let (_, r) = stats(&s, &s.session.access_token, "?year=2024").await;
    assert_eq!(r["year"]["rated"]["average"], 4.3);
}

#[tokio::test]
async fn users_have_separate_stats_and_libraries_are_isolated() {
    let s = seed(Role::Owner, None, None).await;
    let (u2, s2) = add_user(&s.state, &s.library_id, Role::Member, "Bea").await;
    let a = book(&s, "A", None, Some(10)).await;
    let b = book(&s, "B", None, Some(20)).await;
    read_row(&s, &s.user_id, &a, "read", Some(Y24), None).await;
    read_row(&s, &u2, &a, "read", Some(Y24), Some(3)).await;
    read_row(&s, &u2, &b, "read", Some(Y24 + 1), None).await;
    let (_, r1) = stats(&s, &s.session.access_token, "?year=2024").await;
    let (_, r2) = stats(&s, &s2.access_token, "?year=2024").await;
    assert_eq!(r1["year"]["books"], 1);
    assert_eq!(r2["year"]["books"], 2);
    assert_eq!(r1["year"]["pages"], 10);
    assert_eq!(r2["year"]["pages"], 30);

    let (_, other) = other_library(&s.state).await;
    let (_, ro) = stats(&s, &other.access_token, "?year=2024").await;
    assert_eq!(ro["years"], json!([]));
    assert_eq!(ro["year"]["books"], 0);
}

#[tokio::test]
async fn invalid_year_is_422_and_auth_required() {
    let s = seed(Role::Owner, None, None).await;
    for q in [
        "?year=abc",
        "?year=1899",
        "?year=2201",
        "?year=",
        "?year=20.5",
    ] {
        let (st, b) = stats(&s, &s.session.access_token, q).await;
        assert_eq!(st, 422, "{q}");
        assert_eq!(b["error_code"], "validation");
    }
    let (st, _, _) = call(&s.state, "GET", "/api/v1/stats/reading", None, None).await;
    assert_eq!(st, 401);
}
