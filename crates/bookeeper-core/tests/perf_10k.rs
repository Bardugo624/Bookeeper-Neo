//! Performance of the list, search and statistics routes on a library of
//! 10,000 books (budgets: `docs/forge/fase-7a/CONTRATTO.md`).
//!
//! `cargo test --release -p bookeeper-core --test perf_10k -- --ignored --nocapture`

mod common;

use std::time::{Duration, Instant};

use common::big::{big_library, BigLibrary};

const WARMUP: usize = 3;
const RUNS: usize = 20;

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

async fn time_route(lib: &BigLibrary, path: &str) -> (f64, f64) {
    let mut samples = Vec::with_capacity(RUNS);
    for i in 0..WARMUP + RUNS {
        let start = Instant::now();
        let (status, _, body) =
            common::call(lib.state(), "GET", path, Some(lib.token()), None).await;
        let took = start.elapsed();
        assert_eq!(status, 200, "{path}: {body}");
        if i >= WARMUP {
            samples.push(took);
        }
    }
    samples.sort();
    (
        ms(samples[RUNS / 2]),
        ms(samples[(RUNS * 95).div_ceil(100) - 1]),
    )
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "performance: run with --release and --ignored"]
async fn routes_stay_within_budget() {
    let started = Instant::now();
    let lib = big_library().await;
    println!("library created in {:.0} ms", ms(started.elapsed()));

    let tag = &lib.tag_ids[3];
    let room = &lib.room_ids[0];
    let shelf = &lib.shelf_ids[0];
    let combined = format!(
        "/api/v1/books?reading=read&tag_id={tag}&room_id={room}&year_from=1950&year_to=2000"
    );
    let routes: Vec<(String, String, f64)> = vec![
        ("books (default order)".into(), "/api/v1/books".into(), 30.0),
        (
            "books (by title)".into(),
            "/api/v1/books?sort=title".into(),
            30.0,
        ),
        ("books q".into(), "/api/v1/books?q=notte+rosa".into(), 30.0),
        (
            "books q (prefix)".into(),
            "/api/v1/books?q=mont".into(),
            30.0,
        ),
        ("books combined filters".into(), combined, 50.0),
        ("books facets".into(), "/api/v1/books/facets".into(), 80.0),
        ("stats".into(), "/api/v1/stats".into(), 100.0),
        (
            "stats reading".into(),
            "/api/v1/stats/reading".into(),
            100.0,
        ),
        (
            "books isbn-index".into(),
            "/api/v1/books/isbn-index".into(),
            150.0,
        ),
        (
            "shelf books".into(),
            format!("/api/v1/shelves/{shelf}/books"),
            30.0,
        ),
        ("loans".into(), "/api/v1/loans".into(), 30.0),
        ("audit".into(), "/api/v1/audit".into(), 30.0),
    ];

    println!(
        "{:<26} {:>9} {:>9} {:>9}",
        "route", "median", "p95", "budget"
    );
    let mut over = Vec::new();
    for (name, path, budget) in &routes {
        let (median, p95) = time_route(&lib, path).await;
        println!("{name:<26} {median:>7.1}ms {p95:>7.1}ms {budget:>7.0}ms");
        if median > *budget {
            over.push(format!("{name}: median {median:.1} ms > {budget} ms"));
        }
    }
    assert!(over.is_empty(), "over budget:\n{}", over.join("\n"));
}

/// `EXPLAIN QUERY PLAN` lines of a statement.
fn plan(conn: &rusqlite::Connection, sql: &str, args: Vec<rusqlite::types::Value>) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .unwrap_or_else(|e| panic!("{e}: {sql}"));
    let rows = stmt
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            r.get::<_, String>(3)
        })
        .expect("plan");
    rows.collect::<Result<_, _>>().expect("plan rows")
}

/// A plan line that reads a whole table of the library without an index.
fn bare_scan(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("SCAN ") else {
        return false;
    };
    let table = rest.split_whitespace().next().unwrap_or("");
    let indexed = rest.contains("USING");
    // Tables whose size grows with the library; the full-text table has its own index.
    matches!(
        table,
        "b" | "books" | "sb" | "shelf_books" | "rd" | "reading" | "l" | "loans"
    ) && !indexed
}

#[tokio::test(flavor = "multi_thread")]
async fn queries_use_an_index_where_the_library_filters_or_sorts() {
    use bookeeper_core::api::books_search::{build_sql, ListBooksQuery};
    use bookeeper_core::api::{isbn_index::ISBN_INDEX_SQL, shelves::SHELF_BOOKS_SQL};
    use rusqlite::types::Value;

    let lib = big_library().await;
    let (lib_id, user) = (lib.seeded.library_id.clone(), lib.seeded.user_id.clone());
    let tag = lib.tag_ids[3].clone();
    let room = lib.room_ids[0].clone();
    let shelf = lib.shelf_ids[0].clone();
    let text = |s: &str| Value::Text(s.to_string());

    let query =
        |json: serde_json::Value| -> ListBooksQuery { serde_json::from_value(json).unwrap() };
    let cases: Vec<(&str, serde_json::Value)> = vec![
        ("default order", serde_json::json!({})),
        ("by title", serde_json::json!({"sort": "title"})),
        ("search", serde_json::json!({"q": "notte rosa"})),
        ("shelf", serde_json::json!({"shelf_id": shelf})),
        ("room", serde_json::json!({"room_id": room})),
        ("unshelved", serde_json::json!({"unshelved": "true"})),
        ("on loan", serde_json::json!({"on_loan": "true"})),
        ("reading", serde_json::json!({"reading": "read"})),
        ("reading none", serde_json::json!({"reading": "none"})),
        ("owner", serde_json::json!({"owner_id": "me"})),
        (
            "years",
            serde_json::json!({"year_from": 1950, "year_to": 2000}),
        ),
        (
            "combined",
            serde_json::json!({"reading": "read", "room_id": room, "year_from": 1950,
                               "year_to": 2000, "sort": "title"}),
        ),
    ];

    let mut statements: Vec<(String, String, Vec<Value>)> = Vec::new();
    for (name, json) in cases {
        let tags = if name == "combined" {
            vec![tag.clone()]
        } else {
            vec![]
        };
        let sql = build_sql(&query(json), &tags, &lib_id, &user, 50, 0).expect(name);
        statements.push((format!("{name} (count)"), sql.count, sql.count_args));
        statements.push((format!("{name} (page)"), sql.list, sql.list_args));
    }
    statements.push((
        "isbn index".into(),
        ISBN_INDEX_SQL.into(),
        vec![text(&lib_id)],
    ));
    statements.push((
        "shelf books".into(),
        SHELF_BOOKS_SQL.into(),
        vec![text(&shelf), text(&lib_id)],
    ));

    let report = lib
        .state()
        .db
        .run(move |conn| {
            let mut bad = Vec::new();
            for (name, sql, args) in statements {
                for line in plan(conn, &sql, args) {
                    println!("{name}: {line}");
                    if bare_scan(&line) {
                        bad.push(format!("{name}: {line}"));
                    }
                }
            }
            Ok(bad)
        })
        .await
        .expect("plans");
    assert!(
        report.is_empty(),
        "queries scan a table without an index:\n{}",
        report.join("\n")
    );
}
