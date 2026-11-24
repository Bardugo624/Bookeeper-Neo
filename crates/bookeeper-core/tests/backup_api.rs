mod common;

use std::io::{Cursor, Read, Write};

use axum::body::Body;
use axum::http::{HeaderMap, Request};
use bookeeper_core::auth::Role;
use bookeeper_core::{backup, router, AppState};
use common::*;
use http_body_util::BodyExt;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use serde_json::{json, Value};
use tower::ServiceExt;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const PW: &str = "correct horse battery";
const EMAIL: &str = "ada@example.com";

// ------------------------------------------------------------------ helpers

async fn raw(
    state: &AppState,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Vec<u8>,
    extra: &[(&str, &str)],
) -> (u16, HeaderMap, Vec<u8>) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    for (k, v) in extra {
        req = req.header(*k, *v);
    }
    let resp = router(state.clone())
        .oneshot(req.body(Body::from(body)).unwrap())
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

fn code(body: &[u8]) -> String {
    serde_json::from_slice::<Value>(body)
        .map(|v| v["error_code"].as_str().unwrap_or("").to_string())
        .unwrap_or_default()
}

async fn owner() -> Seeded {
    seed(Role::Owner, Some(EMAIL), Some(PW)).await
}

async fn confirm_token(state: &AppState, bearer: &str, password: Option<&str>) -> String {
    let body = match password {
        Some(p) => json!({ "password": p }),
        None => json!({}),
    };
    let (st, _, b) = call(
        state,
        "POST",
        "/api/v1/auth/confirm",
        Some(bearer),
        Some(body),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    b["confirm_token"].as_str().unwrap().to_string()
}

async fn do_backup(state: &AppState, token: &str) -> Vec<u8> {
    let (st, headers, bytes) = raw(state, "POST", "/api/v1/backup", Some(token), vec![], &[]).await;
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&bytes));
    assert_eq!(headers["content-type"], "application/zip");
    bytes
}

async fn do_restore(
    state: &AppState,
    token: &str,
    confirm: &str,
    archive: Vec<u8>,
) -> (u16, Vec<u8>) {
    let (st, _, b) = raw(
        state,
        "POST",
        "/api/v1/restore",
        Some(token),
        archive,
        &[("x-confirm-token", confirm)],
    )
    .await;
    (st, b)
}

fn png_bytes(seed: u32) -> Vec<u8> {
    let img = RgbImage::from_fn(200, 300, |x, y| {
        Rgb([
            ((x * 7 + y * 3) + seed) as u8,
            ((x * 5) ^ (y * 11)) as u8,
            ((x + y) * 13) as u8,
        ])
    });
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(img)
        .write_to(&mut out, ImageFormat::Png)
        .unwrap();
    out.into_inner()
}

fn unzip(bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut zip = ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..zip.len())
        .map(|i| {
            let mut f = zip.by_index(i).unwrap();
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).unwrap();
            (f.name().to_string(), buf)
        })
        .collect()
}

fn entry(entries: &[(String, Vec<u8>)], name: &str) -> Vec<u8> {
    entries
        .iter()
        .find(|(n, _)| n == name)
        .unwrap_or_else(|| panic!("no entry {name}"))
        .1
        .clone()
}

fn rezip(entries: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in entries {
        zip.start_file(name.as_str(), opts).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

fn manifest() -> Vec<u8> {
    json!({
        "format": "bookeeper-backup", "format_version": 1, "app_version": "test",
        "created_at": 0, "library": {"id": "x", "name": "X"}, "counts": {}
    })
    .to_string()
    .into_bytes()
}

/// A valid, empty archive plus extra entries.
fn hostile(extra: Vec<(String, Vec<u8>)>) -> Vec<u8> {
    let mut e = vec![
        ("manifest.json".to_string(), manifest()),
        ("data.json".to_string(), b"{}".to_vec()),
    ];
    e.extend(extra);
    rezip(&e)
}

async fn sql<R: Send + 'static>(
    state: &AppState,
    f: impl FnOnce(&mut rusqlite::Connection) -> rusqlite::Result<R> + Send + 'static,
) -> R {
    state.db.run(f).await.unwrap()
}

async fn api_archive(state: &AppState, lib: &str) -> Vec<u8> {
    let (files, lib) = (state.files.clone(), lib.to_string());
    sql(state, move |c| {
        Ok(backup::create_archive(c, &files, &lib, 1_700_000_000).unwrap())
    })
    .await
}

/// The data of a library as stored in an archive, without the cover colour (covers are
/// re-encoded on restore).
async fn data_of(state: &AppState, lib: &str) -> Value {
    let bytes = api_archive(state, lib).await;
    let entries = unzip(&bytes);
    let mut data: Value = serde_json::from_slice(&entry(&entries, "data.json")).unwrap();
    for b in data["books"].as_array_mut().unwrap() {
        b.as_object_mut().unwrap().remove("cover_color");
    }
    data
}

fn cover_files(state: &AppState) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(&state.files.covers_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn data_dir_files(state: &AppState) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(state.files.covers_dir.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

struct World {
    book_a: String,
    book_b: String,
    shelf: String,
}

/// Two books (A with a cover), a shelf with A placed, an open loan on B, a wish,
/// a room, a tag on A and a reading row.
async fn populate(s: &Seeded) -> World {
    let tok = &s.session.access_token;
    let (st, _, a) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(tok),
        Some(
            json!({"title": "Il nome della rosa", "authors": ["Umberto Eco"],
                    "isbn_13": "9788845292613", "progressive_number": 1}),
        ),
    )
    .await;
    assert_eq!(st, 201, "{a}");
    let (_, _, b) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(tok),
        Some(
            json!({"title": "Il pendolo di Foucault", "authors": ["Umberto Eco"],
                    "progressive_number": 2}),
        ),
    )
    .await;
    let (book_a, book_b) = (
        a["id"].as_str().unwrap().to_string(),
        b["id"].as_str().unwrap().to_string(),
    );
    let (st, _, sh) = call(
        &s.state,
        "POST",
        "/api/v1/shelves",
        Some(tok),
        Some(json!({"name": "Studio", "rows": 3, "slots_per_row": 10})),
    )
    .await;
    assert_eq!(st, 201, "{sh}");
    let shelf = sh["id"].as_str().unwrap().to_string();
    let (st, _, p) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book_a}/placement"),
        Some(tok),
        Some(json!({"shelf_id": shelf, "row_index": 1, "slot_index": 4})),
    )
    .await;
    assert_eq!(st, 200, "{p}");
    let (st, _, l) = call(
        &s.state,
        "POST",
        "/api/v1/loans",
        Some(tok),
        Some(json!({"book_id": book_b, "borrower_name": "Carlo"})),
    )
    .await;
    assert_eq!(st, 201, "{l}");
    let (st, _, w) = call(
        &s.state,
        "POST",
        "/api/v1/wishlist",
        Some(tok),
        Some(json!({"title": "Baudolino"})),
    )
    .await;
    assert_eq!(st, 201, "{w}");
    let (st, _, bytes) = raw(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book_a}/cover"),
        Some(tok),
        png_bytes(1),
        &[],
    )
    .await;
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&bytes));
    let (lib, uid, ba) = (s.library_id.clone(), s.user_id.clone(), book_a.clone());
    sql(&s.state, move |c| {
        c.execute(
            "INSERT INTO rooms (id, library_id, name, created_at) VALUES ('room-1', ?1, 'Salotto', 1)",
            [&lib],
        )?;
        c.execute(
            "INSERT INTO tags (id, library_id, name, color) VALUES ('tag-1', ?1, 'giallo', 'sage')",
            [&lib],
        )?;
        c.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (?1, 'tag-1')", [&ba])?;
        c.execute(
            "INSERT INTO reading (id, library_id, user_id, book_id, status, updated_at) \
             VALUES ('read-1', ?1, ?2, ?3, 'reading', 5)",
            rusqlite::params![lib, uid, ba],
        )?;
        c.execute("UPDATE shelves SET room_id = 'room-1' WHERE library_id = ?1", [&lib])?;
        Ok(())
    })
    .await;
    World {
        book_a,
        book_b,
        shelf,
    }
}

async fn search_total(state: &AppState, token: &str, q: &str) -> i64 {
    let (st, _, b) = call(
        state,
        "GET",
        &format!("/api/v1/books?q={q}"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(st, 200, "{b}");
    b["total"].as_i64().unwrap()
}

// ------------------------------------------------------------------ backup

#[tokio::test]
async fn backup_contains_manifest_data_and_covers() {
    let s = owner().await;
    let w = populate(&s).await;
    let tok = &s.session.access_token;
    let (st, headers, bytes) =
        raw(&s.state, "POST", "/api/v1/backup", Some(tok), vec![], &[]).await;
    assert_eq!(st, 200);
    let disposition = headers["content-disposition"].to_str().unwrap();
    assert!(
        disposition.starts_with("attachment; filename=\"bookeeper-Casa-")
            && disposition.ends_with(".zip\""),
        "{disposition}"
    );
    let stamp = disposition
        .trim_start_matches("attachment; filename=\"bookeeper-Casa-")
        .trim_end_matches(".zip\"");
    assert_eq!(stamp.len(), 15, "{stamp}");
    assert_eq!(stamp.as_bytes()[8], b'-');

    let entries = unzip(&bytes);
    let names: Vec<&str> = entries.iter().map(|(n, _)| n.as_str()).collect();
    assert!(names.contains(&"manifest.json") && names.contains(&"data.json"));
    assert!(names.contains(&format!("covers/{}.jpg", w.book_a).as_str()));
    assert_eq!(names.iter().filter(|n| n.starts_with("covers/")).count(), 1);

    let m: Value = serde_json::from_slice(&entry(&entries, "manifest.json")).unwrap();
    assert_eq!(m["format"], "bookeeper-backup");
    assert_eq!(m["format_version"], 1);
    assert_eq!(m["library"]["id"], s.library_id);
    assert_eq!(m["library"]["name"], "Casa");
    assert!(m["created_at"].as_i64().unwrap() > 0);
    assert!(m["app_version"].is_string());
    assert_eq!(m["counts"]["books"], 2);
    assert_eq!(m["counts"]["shelves"], 1);
    assert_eq!(m["counts"]["loans"], 1);
    assert_eq!(m["counts"]["wishlist"], 1);

    let d: Value = serde_json::from_slice(&entry(&entries, "data.json")).unwrap();
    for t in [
        "rooms",
        "shelves",
        "books",
        "shelf_books",
        "loans",
        "wishlist",
        "reading",
        "tags",
        "book_tags",
        "users",
    ] {
        assert!(d[t].is_array(), "missing {t}");
    }
    assert_eq!(d["books"].as_array().unwrap().len(), 2);
    assert_eq!(d["shelf_books"].as_array().unwrap().len(), 1);
    assert_eq!(d["book_tags"].as_array().unwrap().len(), 1);
    assert_eq!(d["users"][0]["display_name"], "Ada");
    assert_eq!(d["users"][0]["role"], "owner");
    assert_eq!(d["users"][0].as_object().unwrap().len(), 3);
    let _ = w.book_b;
}

#[tokio::test]
async fn backup_never_contains_secrets() {
    let s = owner().await;
    populate(&s).await;
    let (hash, refresh): (String, String) = sql(&s.state, |c| {
        c.query_row(
            "SELECT (SELECT password_hash FROM users LIMIT 1), (SELECT refresh_hash FROM devices LIMIT 1)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
    })
    .await;
    let bytes = do_backup(&s.state, &s.session.access_token).await;
    let entries = unzip(&bytes);
    let text: String = entries
        .iter()
        .filter(|(n, _)| !n.starts_with("covers/"))
        .map(|(_, b)| String::from_utf8_lossy(b).into_owned())
        .collect();
    for needle in [
        EMAIL,
        hash.as_str(),
        refresh.as_str(),
        "$argon2",
        "password",
        "email",
        "jwt_secret",
        "server_meta",
        "refresh",
        "audit",
        s.session.access_token.as_str(),
        s.session.refresh_token.as_str(),
    ] {
        assert!(!text.contains(needle), "archive leaks {needle}");
    }
}

#[tokio::test]
async fn backup_then_restore_round_trips() {
    let s = owner().await;
    let w = populate(&s).await;
    let tok = &s.session.access_token;
    let before = data_of(&s.state, &s.library_id).await;
    let covers_before = cover_files(&s.state);
    assert_eq!(covers_before, vec![format!("{}.jpg", w.book_a)]);
    let archive = do_backup(&s.state, tok).await;

    // Wreck the library, then restore.
    for id in [&w.book_a, &w.book_b] {
        let (st, _, _) = call(
            &s.state,
            "DELETE",
            &format!("/api/v1/books/{id}"),
            Some(tok),
            None,
        )
        .await;
        assert_eq!(st, 204);
    }
    assert!(cover_files(&s.state).is_empty());
    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, body) = do_restore(&s.state, tok, &c, archive).await;
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&body));
    let report: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        report,
        json!({"books": 2, "shelves": 1, "loans": 1, "wishlist": 1, "covers": 1, "users_remapped": 0})
    );

    assert_eq!(data_of(&s.state, &s.library_id).await, before);
    assert_eq!(cover_files(&s.state), covers_before);
    let (st, headers, bytes) = raw(
        &s.state,
        "GET",
        &format!("/api/v1/books/{}/cover", w.book_a),
        Some(tok),
        vec![],
        &[],
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(headers["content-type"], "image/jpeg");
    assert!(image::load_from_memory(&bytes).is_ok());
    let (_, _, book) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{}", w.book_a),
        Some(tok),
        None,
    )
    .await;
    assert_eq!(book["placement"]["slot_index"], 4);
    assert!(book["cover_color"]
        .as_str()
        .is_some_and(|c| c.starts_with('#')));
    let (_, _, loans) = call(
        &s.state,
        "GET",
        "/api/v1/loans?status=active",
        Some(tok),
        None,
    )
    .await;
    assert_eq!(loans["total"], 1);
    let _ = w.shelf;
}

#[tokio::test]
async fn restore_replaces_existing_data() {
    let s = owner().await;
    let w = populate(&s).await;
    let tok = &s.session.access_token;
    let archive = do_backup(&s.state, tok).await;
    let (st, _, extra) = call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(tok),
        Some(json!({"title": "Dopo il backup", "authors": []})),
    )
    .await;
    assert_eq!(st, 201);
    let extra_id = extra["id"].as_str().unwrap().to_string();
    let (st, _, _) = raw(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{extra_id}/cover"),
        Some(tok),
        png_bytes(9),
        &[],
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(cover_files(&s.state).len(), 2);

    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, _) = do_restore(&s.state, tok, &c, archive).await;
    assert_eq!(st, 200);
    let (st, _, _) = call(
        &s.state,
        "GET",
        &format!("/api/v1/books/{extra_id}"),
        Some(tok),
        None,
    )
    .await;
    assert_eq!(st, 404);
    let (_, _, list) = call(&s.state, "GET", "/api/v1/books", Some(tok), None).await;
    assert_eq!(list["total"], 2);
    // The cover of the vanished book is gone, the restored one is back.
    assert_eq!(cover_files(&s.state), vec![format!("{}.jpg", w.book_a)]);
    // Devices and the session survive.
    let (st, _, _) = call(&s.state, "GET", "/api/v1/me", Some(tok), None).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn restored_books_are_searchable_and_removed_ones_are_not() {
    let s = owner().await;
    populate(&s).await;
    let tok = &s.session.access_token;
    let archive = do_backup(&s.state, tok).await;
    assert_eq!(search_total(&s.state, tok, "rosa").await, 1);
    call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(tok),
        Some(json!({"title": "Zeitgeist unico", "authors": []})),
    )
    .await;
    assert_eq!(search_total(&s.state, tok, "Zeitgeist").await, 1);

    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, _) = do_restore(&s.state, tok, &c, archive).await;
    assert_eq!(st, 200);
    assert_eq!(search_total(&s.state, tok, "rosa").await, 1);
    assert_eq!(search_total(&s.state, tok, "pendolo").await, 1);
    assert_eq!(search_total(&s.state, tok, "Eco").await, 2);
    assert_eq!(search_total(&s.state, tok, "9788845292613").await, 1);
    assert_eq!(search_total(&s.state, tok, "Zeitgeist").await, 0);
}

#[tokio::test]
async fn restore_into_another_library_rewrites_ownership() {
    let a = owner().await;
    let w = populate(&a).await;
    let (carlo, _) = add_user(&a.state, &a.library_id, Role::Member, "Carlo").await;
    let (lib_a, carlo_id, ba) = (a.library_id.clone(), carlo.clone(), w.book_a.clone());
    sql(&a.state, move |c| {
        c.execute(
            "INSERT INTO wishlist (id, library_id, user_id, title, priority, created_at) \
             VALUES ('wish-c', ?1, ?2, 'Di Carlo', 0, 3)",
            rusqlite::params![lib_a, carlo_id],
        )?;
        c.execute(
            "UPDATE books SET owner_user_id = ?1 WHERE id = ?2",
            rusqlite::params![carlo_id, ba],
        )?;
        Ok(())
    })
    .await;
    let a_before = data_of(&a.state, &a.library_id).await;
    let a_covers = cover_files(&a.state);
    let archive = do_backup(&a.state, &a.session.access_token).await;

    // B lives on the same server (same database and covers folder).
    let (lib_b, b_session) = other_library(&a.state).await;
    let (b_user,): (String,) = {
        let lb = lib_b.clone();
        (sql(&a.state, move |c| {
            c.query_row("SELECT id FROM users WHERE library_id = ?1", [&lb], |r| {
                r.get(0)
            })
        })
        .await,)
    };
    let (st, _, _) = call(
        &a.state,
        "POST",
        "/api/v1/books",
        Some(&b_session.access_token),
        Some(json!({"title": "Libro di B", "authors": []})),
    )
    .await;
    assert_eq!(st, 201);
    let c = confirm_token(&a.state, &b_session.access_token, None).await;
    let (st, body) = do_restore(&a.state, &b_session.access_token, &c, archive).await;
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&body));
    let report: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(report["books"], 2);
    assert_eq!(report["users_remapped"], 2, "Ada and Carlo are not in B");

    // A is untouched.
    assert_eq!(data_of(&a.state, &a.library_id).await, a_before);
    for id in [&w.book_a, &w.book_b] {
        let (st, _, _) = call(
            &a.state,
            "GET",
            &format!("/api/v1/books/{id}"),
            Some(&a.session.access_token),
            None,
        )
        .await;
        assert_eq!(st, 200);
    }
    assert!(a_covers.iter().all(|f| cover_files(&a.state).contains(f)));

    // B has the data, with fresh ids where A still owns them.
    let (_, _, list) = call(
        &a.state,
        "GET",
        "/api/v1/books",
        Some(&b_session.access_token),
        None,
    )
    .await;
    assert_eq!(list["total"], 2);
    let b_ids: Vec<String> = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["id"].as_str().unwrap().to_string())
        .collect();
    assert!(!b_ids.contains(&w.book_a) && !b_ids.contains(&w.book_b));
    let owners: Vec<(String, Option<String>)> = {
        let lb = lib_b.clone();
        sql(&a.state, move |c| {
            let mut st =
                c.prepare("SELECT library_id, owner_user_id FROM books WHERE library_id = ?1")?;
            let rows = st.query_map([&lb], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect()
        })
        .await
    };
    assert_eq!(owners.len(), 2);
    assert!(owners.iter().all(|(l, o)| *l == lib_b && o.is_none()));
    let wish_users: Vec<String> = {
        let lb = lib_b.clone();
        sql(&a.state, move |c| {
            let mut st = c.prepare("SELECT user_id FROM wishlist WHERE library_id = ?1")?;
            let rows = st.query_map([&lb], |r| r.get(0))?;
            rows.collect()
        })
        .await
    };
    assert_eq!(wish_users, vec![b_user.clone(), b_user]);
    // The placed book kept its place on the copied shelf, and its cover works.
    let placed = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["title"] == "Il nome della rosa")
        .unwrap();
    assert_eq!(placed["placement"]["slot_index"], 4);
    assert_ne!(placed["placement"]["shelf_id"], json!(w.shelf));
    let new_id = placed["id"].as_str().unwrap();
    let (st, _, _) = raw(
        &a.state,
        "GET",
        &format!("/api/v1/books/{new_id}/cover"),
        Some(&b_session.access_token),
        vec![],
        &[],
    )
    .await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn unknown_users_are_remapped_to_the_restorer() {
    let s = owner().await;
    let w = populate(&s).await;
    let archive = do_backup(&s.state, &s.session.access_token).await;
    let mut entries = unzip(&archive);
    let mut data: Value = serde_json::from_slice(&entry(&entries, "data.json")).unwrap();
    data["users"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id": "ghost-1", "display_name": "Ghost", "role": "member"}));
    data["wishlist"][0]["user_id"] = json!("ghost-1");
    data["reading"][0]["user_id"] = json!("ghost-1");
    data["books"][0]["owner_user_id"] = json!("ghost-1");
    data["loans"][0]["borrower_user_id"] = json!("ghost-2");
    entries
        .iter_mut()
        .find(|(n, _)| n == "data.json")
        .unwrap()
        .1 = data.to_string().into_bytes();

    let tok = &s.session.access_token;
    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, body) = do_restore(&s.state, tok, &c, rezip(&entries)).await;
    assert_eq!(st, 200, "{}", String::from_utf8_lossy(&body));
    let report: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(report["users_remapped"], 2);
    let uid = s.user_id.clone();
    let (wish, reading, owner_ref, borrower): (String, String, Option<String>, Option<String>) =
        sql(&s.state, |c| {
            c.query_row(
                "SELECT (SELECT user_id FROM wishlist), (SELECT user_id FROM reading), \
                 (SELECT owner_user_id FROM books WHERE owner_user_id IS NOT NULL), \
                 (SELECT borrower_user_id FROM loans)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
        })
        .await;
    assert_eq!((wish, reading), (uid.clone(), uid));
    assert_eq!((owner_ref, borrower), (None, None));
    let _ = w;
}

#[tokio::test]
async fn restore_is_atomic() {
    let s = owner().await;
    populate(&s).await;
    let tok = &s.session.access_token;
    let archive = do_backup(&s.state, tok).await;
    let mut entries = unzip(&archive);
    let mut data: Value = serde_json::from_slice(&entry(&entries, "data.json")).unwrap();
    // Passes the format checks, fails on insert after the old data was already deleted.
    data["books"][1]["format"] = json!("papyrus");
    entries
        .iter_mut()
        .find(|(n, _)| n == "data.json")
        .unwrap()
        .1 = data.to_string().into_bytes();

    let before = data_of(&s.state, &s.library_id).await;
    let files_before = cover_files(&s.state);
    call(
        &s.state,
        "POST",
        "/api/v1/books",
        Some(tok),
        Some(json!({"title": "Sopravvissuto", "authors": []})),
    )
    .await;
    let before_with_extra = data_of(&s.state, &s.library_id).await;
    assert_ne!(before, before_with_extra);

    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, body) = do_restore(&s.state, tok, &c, rezip(&entries)).await;
    assert_eq!(st, 400);
    assert_eq!(code(&body), "invalid_archive");
    assert_eq!(data_of(&s.state, &s.library_id).await, before_with_extra);
    assert_eq!(cover_files(&s.state), files_before);
    assert_eq!(search_total(&s.state, tok, "Sopravvissuto").await, 1);
    assert_eq!(search_total(&s.state, tok, "rosa").await, 1);
    assert!(audit_rows(&s.state, &s.library_id)
        .await
        .iter()
        .all(|(a, _, _)| a != "library.restore"));
}

#[tokio::test]
async fn hostile_archives_are_rejected() {
    let s = owner().await;
    let w = populate(&s).await;
    let tok = &s.session.access_token;
    let good = unzip(&do_backup(&s.state, tok).await);

    let with_data = |data: Value| {
        let mut e = good.clone();
        e.iter_mut().find(|(n, _)| n == "data.json").unwrap().1 = data.to_string().into_bytes();
        rezip(&e)
    };
    let good_data: Value = serde_json::from_slice(&entry(&good, "data.json")).unwrap();
    let with_manifest = |m: Value| {
        let mut e = good.clone();
        e.iter_mut().find(|(n, _)| n == "manifest.json").unwrap().1 = m.to_string().into_bytes();
        rezip(&e)
    };
    let good_manifest: Value = serde_json::from_slice(&entry(&good, "manifest.json")).unwrap();

    let mut cases: Vec<(&str, Vec<u8>)> = vec![
        ("not a zip", b"definitely not a zip file".to_vec()),
        ("empty body", Vec::new()),
        (
            "manifest missing",
            rezip(&[("data.json".to_string(), b"{}".to_vec())]),
        ),
        (
            "data missing",
            rezip(&[("manifest.json".to_string(), manifest())]),
        ),
        (
            "wrong format",
            with_manifest({
                let mut m = good_manifest.clone();
                m["format"] = json!("something-else");
                m
            }),
        ),
        (
            "unknown version",
            with_manifest({
                let mut m = good_manifest.clone();
                m["format_version"] = json!(2);
                m
            }),
        ),
        (
            "unknown table",
            with_data({
                let mut d = good_data.clone();
                d["audit_log"] = json!([]);
                d
            }),
        ),
        (
            "unknown table: server_meta",
            with_data({
                let mut d = good_data.clone();
                d["server_meta"] = json!([{"key": "jwt_secret", "value": "x"}]);
                d
            }),
        ),
        (
            "unknown column",
            with_data({
                let mut d = good_data.clone();
                d["books"][0]["password_hash"] = json!("x");
                d
            }),
        ),
        (
            "dangling reference",
            with_data({
                let mut d = good_data.clone();
                d["loans"][0]["book_id"] = json!("nope");
                d
            }),
        ),
        (
            "unsafe id",
            with_data({
                let mut d = good_data.clone();
                d["books"][0]["id"] = json!("../../evil");
                d
            }),
        ),
        ("cover is not an image", {
            let mut e = good.clone();
            e.iter_mut()
                .find(|(n, _)| n.starts_with("covers/"))
                .unwrap()
                .1 = b"GIF89a not really".to_vec();
            rezip(&e)
        }),
    ];
    for (label, name) in [
        ("absolute path", "/tmp/evil.jpg"),
        ("parent directory", "../evil.jpg"),
        ("parent inside covers", "covers/../../evil.jpg"),
        ("outside covers", "other/evil.jpg"),
        ("nested in covers", "covers/sub/evil.jpg"),
        ("backslash", "covers\\..\\evil.jpg"),
        ("stray top-level file", "evil.jpg"),
    ] {
        cases.push((label, hostile(vec![(name.to_string(), png_bytes(3))])));
    }

    // More than 100,000 entries.
    {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("manifest.json", stored).unwrap();
        zip.write_all(&manifest()).unwrap();
        zip.start_file("data.json", stored).unwrap();
        zip.write_all(b"{}").unwrap();
        for i in 0..100_001 {
            zip.start_file(format!("covers/{i}"), stored).unwrap();
        }
        cases.push(("too many entries", zip.finish().unwrap().into_inner()));
    }
    // One entry just over 20 MB, and many entries of exactly 20 MB (over 1 GB together).
    // The sizes in the headers are irrelevant: the content is counted while inflating.
    {
        let mut one = ZipWriter::new(Cursor::new(Vec::new()));
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        one.start_file("covers/big.jpg", deflated).unwrap();
        let chunk = vec![0u8; 1024 * 1024];
        for _ in 0..20 {
            one.write_all(&chunk).unwrap();
        }
        let exact = one.finish().unwrap().into_inner();
        let mut src = ZipArchive::new(Cursor::new(exact)).unwrap();
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("manifest.json", stored).unwrap();
        zip.write_all(&manifest()).unwrap();
        zip.start_file("data.json", stored).unwrap();
        zip.write_all(b"{}").unwrap();
        for i in 0..55 {
            zip.raw_copy_file_rename(src.by_index_raw(0).unwrap(), format!("covers/z{i}.jpg"))
                .unwrap();
        }
        cases.push(("over 1 GB decompressed", zip.finish().unwrap().into_inner()));

        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("manifest.json", stored).unwrap();
        zip.write_all(&manifest()).unwrap();
        zip.start_file("data.json", stored).unwrap();
        zip.write_all(b"{}").unwrap();
        zip.start_file("covers/big.jpg", deflated).unwrap();
        for _ in 0..20 {
            zip.write_all(&chunk).unwrap();
        }
        zip.write_all(&[0]).unwrap();
        cases.push(("entry over 20 MB", zip.finish().unwrap().into_inner()));
    }

    let before = data_of(&s.state, &s.library_id).await;
    let covers_before = cover_files(&s.state);
    let tree_before = data_dir_files(&s.state);
    let c = confirm_token(&s.state, tok, Some(PW)).await;
    for (label, archive) in cases {
        let (st, body) = do_restore(&s.state, tok, &c, archive).await;
        assert_eq!(st, 400, "{label}: {}", String::from_utf8_lossy(&body));
        assert_eq!(code(&body), "invalid_archive", "{label}");
        assert_eq!(data_of(&s.state, &s.library_id).await, before, "{label}");
        assert_eq!(cover_files(&s.state), covers_before, "{label}");
        assert_eq!(data_dir_files(&s.state), tree_before, "{label}");
    }
    assert_eq!(search_total(&s.state, tok, "rosa").await, 1);
    for name in ["evil.jpg", "tmp/evil.jpg"] {
        let outside = s.state.files.covers_dir.join("..").join("..").join(name);
        assert!(!outside.exists());
    }
    let _ = w;
}

// ------------------------------------------------------------------ access

#[tokio::test]
async fn restore_needs_owner_and_confirmation() {
    let s = owner().await;
    populate(&s).await;
    let archive = do_backup(&s.state, &s.session.access_token).await;
    let (_, admin) = add_user(&s.state, &s.library_id, Role::Admin, "Dora").await;

    // An admin is refused even with a valid confirmation.
    let c_admin = confirm_token(&s.state, &admin.access_token, None).await;
    let (st, body) = do_restore(&s.state, &admin.access_token, &c_admin, archive.clone()).await;
    assert_eq!(st, 403);
    assert_eq!(code(&body), "forbidden");
    let (st, _, body) = raw(
        &s.state,
        "POST",
        "/api/v1/restore",
        Some(&admin.access_token),
        archive.clone(),
        &[],
    )
    .await;
    assert_eq!(st, 403, "{}", String::from_utf8_lossy(&body));

    // The owner needs the token.
    let (st, _, body) = raw(
        &s.state,
        "POST",
        "/api/v1/restore",
        Some(&s.session.access_token),
        archive.clone(),
        &[],
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(code(&body), "confirmation_required");
    let (st, body) = do_restore(
        &s.state,
        &s.session.access_token,
        "garbage",
        archive.clone(),
    )
    .await;
    assert_eq!(st, 401);
    assert_eq!(code(&body), "confirmation_required");
    // Someone else's token does not do either.
    let (st, body) = do_restore(&s.state, &s.session.access_token, &c_admin, archive.clone()).await;
    assert_eq!(st, 401);
    assert_eq!(code(&body), "confirmation_required");

    let c = confirm_token(&s.state, &s.session.access_token, Some(PW)).await;
    let (st, _) = do_restore(&s.state, &s.session.access_token, &c, archive).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn backup_needs_admin() {
    let s = owner().await;
    let (_, member) = add_user(&s.state, &s.library_id, Role::Member, "Mario").await;
    let (_, guest) = add_user(&s.state, &s.library_id, Role::Guest, "Gigi").await;
    let (_, admin) = add_user(&s.state, &s.library_id, Role::Admin, "Dora").await;
    for t in [&member, &guest] {
        let (st, _, b) = raw(
            &s.state,
            "POST",
            "/api/v1/backup",
            Some(&t.access_token),
            vec![],
            &[],
        )
        .await;
        assert_eq!(st, 403);
        assert_eq!(code(&b), "forbidden");
    }
    do_backup(&s.state, &admin.access_token).await;
    do_backup(&s.state, &s.session.access_token).await;
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = owner().await;
    for path in ["/api/v1/backup", "/api/v1/restore"] {
        let (st, _, b) = raw(&s.state, "POST", path, None, vec![], &[]).await;
        assert_eq!(st, 401, "{path}");
        assert_eq!(code(&b), "unauthorized");
    }
}

#[tokio::test]
async fn backup_and_restore_are_audited() {
    let s = owner().await;
    populate(&s).await;
    let tok = &s.session.access_token;
    let archive = do_backup(&s.state, tok).await;
    let c = confirm_token(&s.state, tok, Some(PW)).await;
    let (st, _) = do_restore(&s.state, tok, &c, archive).await;
    assert_eq!(st, 200);
    let rows = audit_rows(&s.state, &s.library_id).await;
    for action in ["library.backup", "library.restore"] {
        assert!(
            rows.contains(&(
                action.to_string(),
                "library".to_string(),
                s.library_id.clone()
            )),
            "{action} missing in {rows:?}"
        );
    }
}

#[tokio::test]
async fn oversized_restore_body_is_refused() {
    let s = owner().await;
    let c = confirm_token(&s.state, &s.session.access_token, Some(PW)).await;
    let (st, body) = do_restore(
        &s.state,
        &s.session.access_token,
        &c,
        vec![0u8; backup::MAX_ARCHIVE_BYTES + 1],
    )
    .await;
    assert_eq!(st, 413);
    assert_eq!(code(&body), "payload_too_large");
}
