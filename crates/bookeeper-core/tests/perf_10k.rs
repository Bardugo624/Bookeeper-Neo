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

    {
        use bookeeper_core::api::{audit, facets, loans, stats};
        let (lc, lp) = loans::loans_list_sql();
        let loan_args = || vec![text(&lib_id), Value::Null, Value::Null];
        let page = |mut a: Vec<Value>| {
            a.push(Value::Integer(50));
            a.push(Value::Integer(0));
            a
        };
        statements.push(("loans (count)".into(), lc, loan_args()));
        statements.push(("loans (page)".into(), lp, page(loan_args())));
        let (ac, ap) = audit::audit_list_sql();
        let mut audit_args = vec![text(&lib_id)];
        audit_args.extend(std::iter::repeat_n(Value::Null, 6));
        statements.push(("audit (count)".into(), ac, audit_args.clone()));
        statements.push(("audit (page)".into(), ap, page(audit_args)));
        for (name, sql) in [
            ("facets tags", facets::TAGS_SQL),
            ("facets rooms", facets::ROOMS_SQL),
            ("facets shelves", facets::SHELVES_SQL),
            ("facets owners", facets::OWNERS_SQL),
        ] {
            statements.push((name.into(), sql.into(), vec![text(&lib_id)]));
        }
        statements.push((
            "facets reading".into(),
            facets::READING_SQL.into(),
            vec![text(&lib_id), text(&user)],
        ));
        statements.push((
            "stats reading years".into(),
            stats::reading_years_sql(),
            vec![text(&user), text(&lib_id)],
        ));

        // `GET /stats` and `GET /stats/reading` keep their SQL inline in `stats.rs`;
        // these are copies of it, to be kept in step.
        let one = || vec![text(&lib_id)];
        let since = || vec![text(&lib_id), Value::Integer(0)];
        for col in ["format", "language", "genre"] {
            statements.push((
                format!("stats count by {col}"),
                format!(
                    "SELECT COALESCE(NULLIF(TRIM({col}), ''), '') AS k, COUNT(*) FROM books
                     WHERE library_id = ?1 GROUP BY k ORDER BY k = '', COUNT(*) DESC, k"
                ),
                one(),
            ));
        }
        statements.push((
            "stats decades".into(),
            "SELECT (published_year / 10) * 10 AS d, COUNT(*) FROM books
             WHERE library_id = ?1 AND published_year IS NOT NULL GROUP BY d ORDER BY d"
                .into(),
            one(),
        ));
        statements.push((
            "stats authors".into(),
            "SELECT DISTINCT b.id, TRIM(j.value) AS a
             FROM books b, json_each(b.authors_json) j
             WHERE b.library_id = ?1 AND j.type = 'text' AND TRIM(j.value) <> ''"
                .into(),
            one(),
        ));
        statements.push((
            "stats additions by month".into(),
            "SELECT strftime('%Y-%m', created_at, 'unixepoch') AS m, COUNT(*) FROM books
             WHERE library_id = ?1 AND created_at >= ?2 GROUP BY m"
                .into(),
            since(),
        ));
        statements.push((
            "stats lent by month".into(),
            "SELECT strftime('%Y-%m', lent_at, 'unixepoch') AS m, COUNT(*) FROM loans
             WHERE library_id = ?1 AND lent_at >= ?2 GROUP BY m"
                .into(),
            since(),
        ));
        statements.push((
            "stats returned by month".into(),
            "SELECT strftime('%Y-%m', returned_at, 'unixepoch') AS m, COUNT(*) FROM loans
             WHERE library_id = ?1 AND returned_at IS NOT NULL AND returned_at >= ?2 GROUP BY m"
                .into(),
            since(),
        ));
        statements.push((
            "stats overview".into(),
            "SELECT
               (SELECT COUNT(*) FROM books WHERE library_id = ?1),
               (SELECT COALESCE(SUM(COALESCE(page_count, 0)), 0) FROM books WHERE library_id = ?1),
               (SELECT COUNT(*) FROM shelves WHERE library_id = ?1),
               (SELECT COUNT(*) FROM wishlist WHERE library_id = ?1 AND user_id = ?2),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NULL),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NULL
                  AND due_at IS NOT NULL AND due_at < ?3),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NOT NULL)"
                .into(),
            vec![text(&lib_id), text(&user), Value::Integer(0)],
        ));
        statements.push((
            "stats shelf fill".into(),
            "SELECT s.id, s.name, s.color, s.rows * s.slots_per_row,
                    (SELECT COUNT(*) FROM shelf_books sb WHERE sb.shelf_id = s.id)
             FROM shelves s WHERE s.library_id = ?1 ORDER BY s.label_code"
                .into(),
            one(),
        ));
        let finished = "r.user_id = ?1 AND b.library_id = ?2 AND r.status = 'read'
             AND r.finished_at IS NOT NULL
             AND CAST(strftime('%Y', r.finished_at, 'unixepoch') AS INTEGER) BETWEEN 1900 AND 2200
             AND strftime('%Y', r.finished_at, 'unixepoch') = ?3";
        let year_args = || vec![text(&user), text(&lib_id), text("2024")];
        for (name, select, tail) in [
            (
                "stats reading by month",
                "SELECT CAST(strftime('%m', r.finished_at, 'unixepoch') AS INTEGER), COUNT(*)",
                "GROUP BY 1",
            ),
            (
                "stats reading totals",
                "SELECT COUNT(*), COALESCE(SUM(COALESCE(b.page_count, 0)), 0),
                        COUNT(r.rating), COALESCE(SUM(r.rating), 0)",
                "",
            ),
            (
                "stats reading genres",
                "SELECT NULLIF(TRIM(b.genre), '')",
                "",
            ),
            (
                "stats reading days",
                "SELECT strftime('%Y-%m-%d', r.finished_at, 'unixepoch') AS d, COUNT(*)",
                "GROUP BY d ORDER BY d",
            ),
            (
                "stats reading longest",
                "SELECT b.id, b.title, b.page_count",
                "AND b.page_count IS NOT NULL AND b.page_count > 0
                 ORDER BY b.page_count DESC, r.finished_at, b.id LIMIT 1",
            ),
        ] {
            statements.push((
                name.into(),
                format!(
                    "{select} FROM reading r JOIN books b ON b.id = r.book_id
                     WHERE {finished} {tail}"
                ),
                year_args(),
            ));
        }
    }

    let report = lib
        .state()
        .db
        .run(move |conn| {
            let mut bad = Vec::new();
            for (name, sql, args) in statements {
                for line in plan(conn, &sql, args) {
                    println!("{name}: {line}");
                    // The tag facet must start from the tags, not walk every book of the library.
                    let walks_books = name == "facets tags"
                        && line.starts_with("SEARCH b ")
                        && line.ends_with("(library_id=?)");
                    if bare_scan(&line) || walks_books {
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
