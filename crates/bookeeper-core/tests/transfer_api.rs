mod common;

use axum::{body::Body, http::Request};
use bookeeper_core::auth::Role;
use bookeeper_core::router;
use common::*;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const GOODREADS: &str = include_str!("fixtures/import/goodreads.csv");
const CALIBRE: &str = include_str!("fixtures/import/calibre.csv");
const LIBRARYTHING: &str = include_str!("fixtures/import/librarything.tsv");

const DUNE13: &str = "9780441172719";
const DUNE10: &str = "0441172717";
const OMENS13: &str = "9780060850524";
const OMENS10: &str = "0060850523";

async fn import(s: &Seeded, format: &str, content: &str, dry_run: bool) -> (u16, Value) {
    let (st, _, body) = call(
        &s.state,
        "POST",
        "/api/v1/import",
        Some(&s.session.access_token),
        Some(json!({"format": format, "content": content, "dry_run": dry_run})),
    )
    .await;
    (st, body)
}

async fn ok_import(s: &Seeded, format: &str, content: &str, dry_run: bool) -> Value {
    let (st, body) = import(s, format, content, dry_run).await;
    assert_eq!(st, 200, "{body}");
    body
}

async fn book_count(s: &Seeded) -> i64 {
    s.state
        .db
        .run(|c| c.query_row("SELECT count(*) FROM books", [], |r| r.get(0)))
        .await
        .unwrap()
}

async fn fts_hits(s: &Seeded, term: &str) -> i64 {
    let term = term.to_string();
    s.state
        .db
        .run(move |c| {
            c.query_row(
                "SELECT count(*) FROM books_fts WHERE books_fts MATCH ?1",
                [term],
                |r| r.get(0),
            )
        })
        .await
        .unwrap()
}

async fn admin() -> Seeded {
    seed(Role::Admin, None, None).await
}

async fn find(s: &Seeded, title: &str) -> Value {
    let rep = ok_import(s, "auto", GOODREADS, true).await;
    rep["preview"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["title"] == title)
        .cloned()
        .unwrap_or_else(|| panic!("{title} not in {rep}"))
}

#[tokio::test]
async fn goodreads_is_parsed() {
    let s = admin().await;
    let rep = ok_import(&s, "goodreads", GOODREADS, true).await;
    assert_eq!(rep["format"], "goodreads");
    assert_eq!(rep["total"], 6);
    assert_eq!(rep["new"], 5);
    assert_eq!(rep["invalid"], 1);
    assert_eq!(rep["errors"][0]["row"], 8); // the review of row 2 spans two lines
    let dune = find(&s, "Dune").await;
    assert_eq!(dune["authors"], json!(["Frank Herbert"]));
    assert_eq!(dune["isbn_13"], DUNE13);
    assert_eq!(dune["isbn_10"], DUNE10);
    assert_eq!(dune["publisher"], "Ace");
    assert_eq!(dune["published_year"], 1990);
    assert_eq!(dune["page_count"], 604);
    assert_eq!(dune["format"], "paperback");
    let omens = find(&s, "Good Omens").await;
    assert_eq!(
        omens["authors"],
        json!(["Terry Pratchett", "Neil Gaiman", "Third Person"])
    );
    assert_eq!(omens["isbn_13"], OMENS13);
    assert_eq!(omens["isbn_10"], OMENS10);
    assert_eq!(omens["format"], "hardcover");
    assert_eq!(omens["notes"], "Funny.\nVery funny, \"really\".");
    let matilda = find(&s, "Matilda").await;
    assert_eq!(matilda["format"], "ebook");
    assert_eq!(matilda["published_year"], 1988);
    let none = find(&s, "Senza Codice").await;
    assert_eq!(none["format"], Value::Null);
    assert_eq!(none["page_count"], Value::Null);
    let audio = find(&s, "Isbn Only Ten").await;
    assert_eq!(audio["format"], "audiobook");
    assert_eq!(audio["isbn_10"], "0306406152");
    assert_eq!(audio["isbn_13"], Value::Null);
}

#[tokio::test]
async fn calibre_is_parsed() {
    let s = admin().await;
    let rep = ok_import(&s, "calibre", CALIBRE, true).await;
    assert_eq!(rep["format"], "calibre");
    assert_eq!(
        (rep["total"].as_i64(), rep["new"].as_i64()),
        (Some(5), Some(5))
    );
    let p = rep["preview"].as_array().unwrap();
    assert_eq!(p[0]["title"], "Dune");
    assert_eq!(p[0]["isbn_13"], DUNE13);
    assert_eq!(p[0]["published_year"], 1990);
    assert_eq!(p[0]["language"], "eng");
    assert_eq!(p[1]["authors"], json!(["Terry Pratchett", "Neil Gaiman"]));
    assert_eq!(p[1]["isbn_10"], OMENS10);
    assert_eq!(p[1]["language"], "eng");
    assert_eq!(p[2]["title"], "Il nome della rosa, edizione \"speciale\"");
    assert_eq!(p[2]["isbn_13"], "9780306406157");
    assert_eq!(p[2]["publisher"], "Bompiani");
    assert_eq!(p[3]["isbn_13"], Value::Null);
    assert_eq!(p[3]["language"], "fra");
    assert_eq!(p[4]["isbn_13"], Value::Null);
}

#[tokio::test]
async fn librarything_is_parsed() {
    let s = admin().await;
    let rep = ok_import(&s, "librarything", LIBRARYTHING, true).await;
    assert_eq!(rep["format"], "librarything");
    assert_eq!(
        (rep["total"].as_i64(), rep["new"].as_i64()),
        (Some(5), Some(5))
    );
    let p = rep["preview"].as_array().unwrap();
    assert_eq!(p[0]["title"], "Dune");
    assert_eq!(p[0]["isbn_10"], DUNE10);
    assert_eq!(p[0]["isbn_13"], DUNE13);
    assert_eq!(p[0]["page_count"], 604);
    assert_eq!(p[0]["published_year"], 1990);
    assert_eq!(p[0]["language"], "English");
    assert_eq!(p[1]["authors"], json!(["Terry Pratchett", "Neil Gaiman"]));
    assert_eq!(p[1]["publisher"], "Harper, 2006");
    assert_eq!(p[1]["published_year"], 2006);
    assert_eq!(p[2]["isbn_13"], "9780140328721");
    assert_eq!(p[3]["isbn_13"], Value::Null);
    assert_eq!(p[4]["isbn_10"], Value::Null);
    assert_eq!(p[4]["page_count"], Value::Null);
}

#[tokio::test]
async fn auto_detects_each_format() {
    let s = admin().await;
    for (content, expected) in [
        (GOODREADS, "goodreads"),
        (CALIBRE, "calibre"),
        (LIBRARYTHING, "librarything"),
    ] {
        let rep = ok_import(&s, "auto", content, true).await;
        assert_eq!(rep["format"], expected);
    }
}

#[tokio::test]
async fn unknown_headers_are_validation() {
    let s = admin().await;
    let (st, body) = import(&s, "auto", "foo,bar\n1,2\n", true).await;
    assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
    let (st, body) = import(&s, "calibre", "foo,bar\n1,2\n", true).await;
    assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
    let (st, body) = import(&s, "auto", "", true).await;
    assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
    let (st, body) = import(&s, "excel", "a", true).await;
    assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
}

#[tokio::test]
async fn goodreads_isbn_wrappers_are_removed() {
    let s = admin().await;
    let csv =
        format!("Title,Author,ISBN,ISBN13\nA,B,\"=\"\"{DUNE10}\"\"\",\"=\"\"{DUNE13}\"\"\"\n");
    let rep = ok_import(&s, "goodreads", &csv, true).await;
    assert_eq!(rep["preview"][0]["isbn_13"], DUNE13);
    assert_eq!(rep["preview"][0]["isbn_10"], DUNE10);
}

#[tokio::test]
async fn bom_crlf_and_quoted_newlines_are_tolerated() {
    let s = admin().await;
    let csv = format!(
        "\u{feff}Title,Author,ISBN13,My Review\r\n\"Uno \"\"due\"\"\",Autore,\"=\"\"{DUNE13}\"\"\",\"riga 1\r\nriga 2\"\r\nTre,Altro,,\r\n"
    );
    let rep = ok_import(&s, "auto", &csv, true).await;
    assert_eq!(rep["format"], "goodreads");
    assert_eq!(rep["total"], 2);
    assert_eq!(rep["invalid"], 0);
    let p = rep["preview"].as_array().unwrap();
    assert_eq!(p[0]["title"], "Uno \"due\"");
    assert_eq!(p[0]["isbn_13"], DUNE13);
    assert_eq!(p[0]["notes"], "riga 1\r\nriga 2");
    assert_eq!(p[1]["title"], "Tre");
}

#[tokio::test]
async fn dry_run_writes_nothing() {
    let s = admin().await;
    let dry = ok_import(&s, "auto", GOODREADS, true).await;
    assert_eq!(book_count(&s).await, 0);
    assert!(audit_rows(&s.state, &s.library_id).await.is_empty());
    let real = ok_import(&s, "auto", GOODREADS, false).await;
    assert_eq!(dry, real);
    assert_eq!(book_count(&s).await, 5);
}

#[tokio::test]
async fn import_inserts_new_books_and_they_are_searchable() {
    let s = admin().await;
    ok_import(&s, "goodreads", GOODREADS, false).await;
    assert_eq!(fts_hits(&s, "Omens").await, 1);
    assert_eq!(fts_hits(&s, "Gaiman").await, 1);
    assert_eq!(fts_hits(&s, DUNE13).await, 1);
    let (st, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/books?q=Matilda",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{body}");
    assert_eq!(body["items"][0]["title"], "Matilda");
}

#[tokio::test]
async fn duplicates_against_the_library_and_within_the_file() {
    let s = admin().await;
    // Already in the library (by ISBN-13).
    ok_import(
        &s,
        "calibre",
        &format!("title,authors,isbn\nDune,F,{DUNE13}\n"),
        false,
    )
    .await;
    assert_eq!(book_count(&s).await, 1);
    // Calibre fixture: Dune (in library), Good Omens, ...; repeat Good Omens in the file.
    let csv = format!("{CALIBRE}Good Omens again,X,{OMENS10},,,,\nDune again,X,{DUNE13},,,,\n");
    let rep = ok_import(&s, "calibre", &csv, true).await;
    assert_eq!(rep["total"], 7);
    assert_eq!(rep["duplicates"], 3);
    assert_eq!(rep["new"], 4);
    let titles: Vec<&str> = rep["preview"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["title"].as_str().unwrap())
        .collect();
    assert!(!titles.contains(&"Dune") && !titles.contains(&"Dune again"));
    assert!(titles.contains(&"Good Omens") && !titles.contains(&"Good Omens again"));
}

#[tokio::test]
async fn rows_without_isbn_are_always_new() {
    let s = admin().await;
    let csv = "title,authors,isbn\nSenza,A,\nSenza,A,\nSenza,A,\n";
    let rep = ok_import(&s, "calibre", csv, false).await;
    assert_eq!(
        (rep["new"].as_i64(), rep["duplicates"].as_i64()),
        (Some(3), Some(0))
    );
    let rep = ok_import(&s, "calibre", csv, false).await;
    assert_eq!(rep["new"], 3);
    assert_eq!(book_count(&s).await, 6);
}

#[tokio::test]
async fn invalid_rows_are_reported_and_skipped() {
    let s = admin().await;
    let long = "x".repeat(301);
    let csv = format!(
        "Title,Author,Year Published\nBuono,A,2000\n,Senza titolo,1999\n{long},A,2000\nAnno,A,3000\nAltro,B,\n"
    );
    let rep = ok_import(&s, "goodreads", &csv, false).await;
    assert_eq!(rep["total"], 5);
    assert_eq!(rep["new"], 2);
    assert_eq!(rep["invalid"], 3);
    let errors = rep["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 3);
    assert_eq!(errors[0]["row"], 3);
    assert_eq!(errors[1]["row"], 4);
    assert_eq!(errors[2]["row"], 5);
    assert!(errors[0]["message"].as_str().unwrap().contains("title"));
    assert!(errors[2]["message"]
        .as_str()
        .unwrap()
        .contains("published_year"));
    assert_eq!(book_count(&s).await, 2);
}

#[tokio::test]
async fn invalid_isbn_is_dropped_but_the_row_is_kept() {
    let s = admin().await;
    let csv = "Title,Author,ISBN,ISBN13\nT,A,12345,9780306406158\n";
    let rep = ok_import(&s, "goodreads", csv, false).await;
    assert_eq!(
        (rep["new"].as_i64(), rep["invalid"].as_i64()),
        (Some(1), Some(0))
    );
    assert_eq!(rep["preview"][0]["isbn_13"], Value::Null);
    assert_eq!(rep["preview"][0]["isbn_10"], Value::Null);
    assert_eq!(book_count(&s).await, 1);
}

#[tokio::test]
async fn more_than_20000_rows_is_validation() {
    let s = admin().await;
    let mut csv = String::from("Title,Author\n");
    for i in 0..20_000 {
        csv.push_str(&format!("T{i},A\n"));
    }
    let rep = ok_import(&s, "goodreads", &csv, true).await;
    assert_eq!(rep["total"], 20_000);
    assert_eq!(rep["preview"].as_array().unwrap().len(), 20);
    csv.push_str("one more,A\n");
    let (st, body) = import(&s, "goodreads", &csv, false).await;
    assert_eq!((st, body["error_code"].as_str()), (422, Some("validation")));
    assert_eq!(book_count(&s).await, 0);
}

#[tokio::test]
async fn errors_are_capped_at_50() {
    let s = admin().await;
    let mut csv = String::from("Title,Author\n");
    for _ in 0..60 {
        csv.push_str(",A\n");
    }
    let rep = ok_import(&s, "goodreads", &csv, true).await;
    assert_eq!(rep["invalid"], 60);
    assert_eq!(rep["errors"].as_array().unwrap().len(), 50);
}

#[tokio::test]
async fn imported_books_leave_no_per_book_audit_rows() {
    let s = admin().await;
    let csv = "Title,Author\nUno,A\nDue,A\nTre,A\n";
    ok_import(&s, "goodreads", csv, false).await;
    assert_eq!(book_count(&s).await, 3);
    let rows = audit_rows(&s.state, &s.library_id).await;
    assert_eq!(
        rows,
        vec![(
            "library.import".to_string(),
            "library".to_string(),
            s.library_id.clone()
        )]
    );
}

#[tokio::test]
async fn import_needs_admin() {
    let s = seed(Role::Member, None, None).await;
    let (st, body) = import(&s, "goodreads", "Title,Author\nA,B\n", false).await;
    assert_eq!((st, body["error_code"].as_str()), (403, Some("forbidden")));
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/import",
        Some(&guest.access_token),
        Some(json!({"format": "goodreads", "content": "Title,Author\nA,B\n"})),
    )
    .await;
    assert_eq!(st, 403);
    assert_eq!(book_count(&s).await, 0);
}

#[tokio::test]
async fn import_is_audited_once() {
    let s = admin().await;
    ok_import(&s, "auto", GOODREADS, true).await;
    assert!(audit_rows(&s.state, &s.library_id).await.is_empty());
    ok_import(&s, "auto", GOODREADS, false).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].0, "library.import");
    let detail: String = s
        .state
        .db
        .run(|c| c.query_row("SELECT detail_json FROM audit_log", [], |r| r.get(0)))
        .await
        .unwrap();
    let detail: Value = serde_json::from_str(&detail).unwrap();
    assert_eq!(
        detail,
        json!({"format": "goodreads", "new": 5, "duplicates": 0, "invalid": 1})
    );
}

#[tokio::test]
async fn large_bodies_are_accepted_on_import_only() {
    let s = admin().await;
    // ~3 MB of content: above axum's 2 MB default, below the 10 MB of this route.
    let note = "x".repeat(2000);
    let mut csv = String::from("Title,Author,My Review\n");
    for i in 0..1500 {
        csv.push_str(&format!("T{i},A,{note}\n"));
    }
    let rep = ok_import(&s, "goodreads", &csv, true).await;
    assert_eq!(rep["new"], 1500);
}

// ---- export ----

async fn raw_get(
    s: &Seeded,
    token: Option<&str>,
    path: &str,
) -> (u16, axum::http::HeaderMap, Vec<u8>) {
    let mut req = Request::builder().method("GET").uri(path);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let resp = router(s.state.clone())
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (status, headers, bytes)
}

async fn export(s: &Seeded, format: &str) -> (u16, axum::http::HeaderMap, Vec<u8>) {
    raw_get(
        s,
        Some(&s.session.access_token),
        &format!("/api/v1/export?format={format}"),
    )
    .await
}

async fn place(s: &Seeded, book: &str, shelf: &str, row: i64, slot: i64) {
    let (b, sh) = (book.to_string(), shelf.to_string());
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0)",
                rusqlite::params![b, sh, row, slot],
            )
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn export_json_contains_every_book_with_its_shelf() {
    let s = seed(Role::Member, None, None).await;
    let a = insert_book(&s.state, &s.library_id, "Alfa").await;
    let _b = insert_book(&s.state, &s.library_id, "Beta").await;
    let shelf = insert_shelf(&s.state, &s.library_id, "Studio", 3, 10).await;
    place(&s, &a, &shelf, 1, 4).await;
    let (st, h, body) = export(&s, "json").await;
    assert_eq!(st, 200);
    assert_eq!(h["content-type"], "application/json");
    let cd = h["content-disposition"].to_str().unwrap();
    assert!(
        cd.starts_with("attachment; filename=\"bookeeper-Casa-") && cd.ends_with(".json\""),
        "{cd}"
    );
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert!(v["exported_at"].as_str().unwrap().ends_with('Z'));
    assert_eq!(v["library"], json!({"id": s.library_id, "name": "Casa"}));
    let books = v["books"].as_array().unwrap();
    assert_eq!(books.len(), 2);
    let alfa = books.iter().find(|b| b["title"] == "Alfa").unwrap();
    assert_eq!(alfa["shelf_name"], "Studio");
    assert_eq!(
        (alfa["row_index"].as_i64(), alfa["slot_index"].as_i64()),
        (Some(1), Some(4))
    );
    assert!(alfa.get("placement").is_none() && alfa.get("on_loan").is_none());
    let beta = books.iter().find(|b| b["title"] == "Beta").unwrap();
    assert_eq!(beta["shelf_name"], Value::Null);
    assert_eq!(beta["row_index"], Value::Null);
}

#[tokio::test]
async fn export_csv_has_the_header_and_escapes_formulas() {
    let s = seed(Role::Member, None, None).await;
    let f = insert_book(&s.state, &s.library_id, "=1+1").await;
    let g = insert_book(&s.state, &s.library_id, "Normale").await;
    let shelf = insert_shelf(&s.state, &s.library_id, "@Studio", 3, 10).await;
    place(&s, &g, &shelf, 0, 2).await;
    let id = f.clone();
    s.state
        .db
        .run(move |c| {
            c.execute(
                "UPDATE books SET authors_json = '[\"-Ada\",\"Bea\"]', notes = '+x', price_cents = 1250 WHERE id = ?1",
                [id],
            )
        })
        .await
        .unwrap();
    let (st, h, body) = export(&s, "csv").await;
    assert_eq!(st, 200);
    assert!(h["content-type"].to_str().unwrap().starts_with("text/csv"));
    assert!(h["content-disposition"]
        .to_str()
        .unwrap()
        .ends_with(".csv\""));
    let mut rd = csv::Reader::from_reader(body.as_slice());
    let header: Vec<String> = rd.headers().unwrap().iter().map(str::to_string).collect();
    assert_eq!(
        header.join(","),
        "title,subtitle,authors,isbn_13,isbn_10,publisher,published_year,language,page_count,genre,format,progressive_number,condition,acquired_at,price_cents,notes,shelf,row,slot"
    );
    let rows: Vec<csv::StringRecord> = rd.records().map(Result::unwrap).collect();
    assert_eq!(rows.len(), 2);
    let formula = rows
        .iter()
        .find(|r| &r[0] == "'=1+1")
        .expect("escaped title");
    assert_eq!(&formula[2], "'-Ada; Bea");
    assert_eq!(&formula[14], "1250");
    assert_eq!(&formula[15], "'+x");
    let plain = rows.iter().find(|r| &r[0] == "Normale").unwrap();
    assert_eq!(&plain[16], "'@Studio");
    assert_eq!((&plain[17], &plain[18]), ("0", "2"));
}

#[tokio::test]
async fn export_filename_is_sanitised() {
    let s = seed(Role::Member, None, None).await;
    s.state
        .db
        .run(|c| c.execute("UPDATE libraries SET name = 'Casa \"mia\"/è..'", []))
        .await
        .unwrap();
    let (st, h, _) = export(&s, "json").await;
    assert_eq!(st, 200);
    let cd = h["content-disposition"].to_str().unwrap();
    let name = cd
        .strip_prefix("attachment; filename=\"")
        .and_then(|n| n.strip_suffix('"'))
        .unwrap();
    assert!(name.starts_with("bookeeper-Casa__mia___.."), "{name}");
    assert!(name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)));
    // `bookeeper-<name>-YYYYMMDD.json`
    let date = name
        .strip_suffix(".json")
        .unwrap()
        .rsplit('-')
        .next()
        .unwrap();
    assert_eq!(date.len(), 8);
    assert!(date.bytes().all(|b| b.is_ascii_digit()));
}

#[tokio::test]
async fn export_never_contains_another_library() {
    let s = seed(Role::Member, None, None).await;
    insert_book(&s.state, &s.library_id, "Mio").await;
    let (other, _) = other_library(&s.state).await;
    insert_book(&s.state, &other, "Altrui").await;
    for format in ["json", "csv"] {
        let (st, _, body) = export(&s, format).await;
        assert_eq!(st, 200);
        let text = String::from_utf8(body).unwrap();
        assert!(text.contains("Mio"), "{format}");
        assert!(
            !text.contains("Altrui") && !text.contains("Altra"),
            "{format}"
        );
    }
}

#[tokio::test]
async fn export_rejects_unknown_formats() {
    let s = seed(Role::Member, None, None).await;
    let (st, _, _) = export(&s, "xml").await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn guest_cannot_export() {
    let s = seed(Role::Owner, None, None).await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Ospite").await;
    let (st, _, _) = raw_get(&s, Some(&guest.access_token), "/api/v1/export?format=json").await;
    assert_eq!(st, 403);
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    let (st, _, _) = raw_get(&s, None, "/api/v1/export?format=json").await;
    assert_eq!(st, 401);
    let (st, _, body) = call(
        &s.state,
        "POST",
        "/api/v1/import",
        None,
        Some(json!({"format": "auto", "content": "x"})),
    )
    .await;
    assert_eq!(st, 401, "{body}");
}

#[test]
fn routes_are_in_the_openapi_document() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    assert!(doc["paths"]["/api/v1/import"]["post"].is_object());
    assert!(doc["paths"]["/api/v1/export"]["get"].is_object());
}

const LT_TITLE_ONLY: &str = include_str!("fixtures/import/librarything_title_only.tsv");
const TAB_UNKNOWN: &str = include_str!("fixtures/import/tab_unknown.tsv");

#[tokio::test]
async fn librarything_is_detected_with_only_a_title_column() {
    let s = admin().await;
    let rep = ok_import(&s, "auto", LT_TITLE_ONLY, true).await;
    assert_eq!(rep["format"], "librarything");
}

#[tokio::test]
async fn any_tab_separated_header_falls_back_to_librarything() {
    let s = admin().await;
    // Detected as LibraryThing (not "unknown format"): the LibraryThing parser
    // is the one that then complains about the missing title column.
    let (st, body) = import(&s, "auto", TAB_UNKNOWN, true).await;
    assert_eq!(st, 422, "{body}");
    assert_eq!(body["message"], "The file has no title column");
}

#[tokio::test]
async fn goodreads_and_calibre_detection_is_unchanged() {
    let s = admin().await;
    assert_eq!(
        ok_import(&s, "auto", GOODREADS, true).await["format"],
        "goodreads"
    );
    assert_eq!(
        ok_import(&s, "auto", CALIBRE, true).await["format"],
        "calibre"
    );
}

#[tokio::test]
async fn in_file_duplicates_match_on_either_isbn() {
    let s = admin().await;
    let only13 = format!("Dune,A,{DUNE13}\n");
    let both = format!("Dune,A,\"{DUNE13},{DUNE10}\"\n");
    for body in [format!("{only13}{both}"), format!("{both}{only13}")] {
        let csv = format!("title,authors,isbn\n{body}");
        let rep = ok_import(&s, "calibre", &csv, true).await;
        assert_eq!(rep["new"], 1, "{rep}");
        assert_eq!(rep["duplicates"], 1, "{rep}");
    }
}

#[tokio::test]
async fn rows_without_isbn_are_never_duplicates() {
    let s = admin().await;
    let csv = "title,authors,isbn\nA,X,\nA,X,\n";
    let rep = ok_import(&s, "calibre", csv, true).await;
    assert_eq!(
        (rep["new"].as_i64(), rep["duplicates"].as_i64()),
        (Some(2), Some(0))
    );
}
