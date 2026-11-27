mod common;

use std::io::{Cursor, Read, Write};

use bookeeper_core::auth::guard::AuthUser;
use bookeeper_core::auth::Role;
use bookeeper_core::backup::{analyze_archive, build_archive, read_snapshot, restore_archive};
use bookeeper_core::AppState;
use common::*;
use serde_json::{json, Value};

const SHA: &str = "aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11";

async fn attach_file(s: &Seeded, book: &str) -> String {
    let id = uuid::Uuid::now_v7().to_string();
    let (i, b, l, u) = (
        id.clone(),
        book.to_string(),
        s.library_id.clone(),
        s.user_id.clone(),
    );
    s.state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO book_files (id, library_id, book_id, format, sha256, size_bytes, \
                 original_name, koreader_hash, uploaded_by, created_at) \
                 VALUES (?1, ?2, ?3, 'epub', ?4, 1234, 'a.epub', 'md5', ?5, 1)",
                rusqlite::params![i, l, b, SHA, u],
            )?;
            c.execute(
                "INSERT INTO reading_positions (id, library_id, user_id, file_id, kind, value, \
                 percent, device_id, updated_at) VALUES (?1, ?2, ?3, ?4, 'cfi', 'epubcfi(/6/2)', 42.5, NULL, 5)",
                rusqlite::params![uuid::Uuid::now_v7().to_string(), l, u, i],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    id
}

async fn archive_of(s: &Seeded) -> Vec<u8> {
    let lib = s.library_id.clone();
    let snap = s
        .state
        .db
        .run(move |c| Ok(read_snapshot(c, &lib)))
        .await
        .unwrap()
        .unwrap();
    build_archive(snap, &s.state.files, 10).unwrap()
}

fn entry(bytes: &[u8], name: &str) -> Value {
    let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut buf = String::new();
    z.by_name(name).unwrap().read_to_string(&mut buf).unwrap();
    serde_json::from_str(&buf).unwrap()
}

fn who(s: &Seeded) -> AuthUser {
    AuthUser {
        library_id: s.library_id.clone(),
        user_id: s.user_id.clone(),
        device_id: "d".into(),
        role: Role::Owner,
    }
}

async fn restore(state: &AppState, s: &Seeded, bytes: Vec<u8>) {
    let parsed = analyze_archive(&bytes).unwrap();
    let (state, w) = (state.clone(), who(s));
    state
        .db
        .run(move |c| Ok(restore_archive(c, &state.files, &w, parsed, 20)))
        .await
        .unwrap()
        .unwrap();
}

async fn count(state: &AppState, table: &'static str) -> i64 {
    state
        .db
        .run(move |c| c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)))
        .await
        .unwrap()
}

#[tokio::test]
async fn archive_lists_files_but_does_not_contain_them() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    attach_file(&s, &book).await;
    // A real file on disk, which must not end up in the archive.
    std::fs::create_dir_all(&s.state.files.ebooks_dir).unwrap();
    std::fs::write(s.state.files.ebooks_dir.join(format!("{SHA}.epub")), b"x").unwrap();

    let bytes = archive_of(&s).await;
    let data = entry(&bytes, "data.json");
    assert_eq!(data["book_files"].as_array().unwrap().len(), 1);
    assert_eq!(data["reading_positions"].as_array().unwrap().len(), 1);
    assert_eq!(data["book_files"][0]["sha256"], SHA);
    let manifest = entry(&bytes, "manifest.json");
    assert_eq!(
        manifest["ebooks"],
        json!({ "count": 1, "total_bytes": 1234 })
    );

    let z = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
    assert!(z.file_names().all(|n| !n.starts_with("ebooks")));
}

#[tokio::test]
async fn restore_brings_back_rows_even_without_the_files() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Libro").await;
    let file = attach_file(&s, &book).await;
    let bytes = archive_of(&s).await;

    // Files folder absent: only the rows come back.
    let _ = std::fs::remove_dir_all(&s.state.files.ebooks_dir);
    restore(&s.state, &s, bytes.clone()).await;
    assert_eq!(count(&s.state, "book_files").await, 1);
    assert_eq!(count(&s.state, "reading_positions").await, 1);
    assert!(!s
        .state
        .files
        .ebooks_dir
        .join(format!("{SHA}.epub"))
        .exists());

    // File present on disk: it is untouched and readable.
    std::fs::create_dir_all(&s.state.files.ebooks_dir).unwrap();
    let path = s.state.files.ebooks_dir.join(format!("{SHA}.epub"));
    std::fs::write(&path, b"content").unwrap();
    restore(&s.state, &s, bytes).await;
    assert_eq!(count(&s.state, "book_files").await, 1);
    assert_eq!(std::fs::read(&path).unwrap(), b"content");
    let id: String = s
        .state
        .db
        .run(|c| c.query_row("SELECT id FROM book_files", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(id, file);
}

#[tokio::test]
async fn old_archive_without_the_new_tables_restores() {
    let s = seed(Role::Owner, None, None).await;
    insert_book(&s.state, &s.library_id, "Libro").await;
    let bytes = archive_of(&s).await;

    // Rewrite the archive with the new tables removed from data.json.
    let mut data = entry(&bytes, "data.json");
    let obj = data.as_object_mut().unwrap();
    obj.remove("book_files");
    obj.remove("reading_positions");
    let manifest = entry(&bytes, "manifest.json");
    let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    w.start_file("manifest.json", opts).unwrap();
    w.write_all(manifest.to_string().as_bytes()).unwrap();
    w.start_file("data.json", opts).unwrap();
    w.write_all(data.to_string().as_bytes()).unwrap();
    let old = w.finish().unwrap().into_inner();

    restore(&s.state, &s, old).await;
    assert_eq!(count(&s.state, "books").await, 1);
    assert_eq!(count(&s.state, "book_files").await, 0);
}
