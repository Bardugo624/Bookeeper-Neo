// crates/bookeeper-core/tests/db.rs
use bookeeper_core::{Db, DbError};

const TABLES: &[&str] = &[
    "libraries",
    "users",
    "devices",
    "pairing_codes",
    "rooms",
    "shelves",
    "books",
    "books_fts",
    "shelf_books",
    "loans",
    "wishlist",
    "reading",
    "tags",
    "book_tags",
    "audit_log",
    "server_meta",
];

#[test]
fn fresh_database_has_every_table() {
    let db = Db::open_in_memory().unwrap();
    for t in TABLES {
        let n: i64 = db
            .with(|c| {
                c.query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name = ?1",
                    [t],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(n, 1, "missing table {t}");
    }
}

#[test]
fn foreign_keys_are_enforced() {
    let db = Db::open_in_memory().unwrap();
    let err =
        db.with(|c| {
            c.execute(
        "INSERT INTO rooms (id, library_id, name, created_at) VALUES ('r','nope','Studio',0)", [])
        });
    assert!(err.is_err());
}

#[test]
fn a_library_has_at_most_one_owner() {
    let db = Db::open_in_memory().unwrap();
    db.with(|c| c.execute_batch(
        "INSERT INTO libraries VALUES ('l','Casa',0);
         INSERT INTO users (id,library_id,display_name,role,created_at) VALUES ('u1','l','A','owner',0);")).unwrap();
    assert!(db.with(|c| c.execute(
        "INSERT INTO users (id,library_id,display_name,role,created_at) VALUES ('u2','l','B','owner',0)", [])).is_err());
}

#[test]
fn reopening_keeps_data_and_does_not_rerun_migrations() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bookeeper.sqlite");
    Db::open(&path)
        .unwrap()
        .with(|c| c.execute("INSERT INTO libraries VALUES ('l','Casa',0)", []))
        .unwrap();
    let n: i64 = Db::open(&path)
        .unwrap()
        .with(|c| c.query_row("SELECT count(*) FROM libraries", [], |r| r.get(0)))
        .unwrap();
    assert_eq!(n, 1);
}

#[test]
fn database_from_newer_version_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bookeeper.sqlite");
    Db::open(&path)
        .unwrap()
        .with(|c| c.pragma_update(None, "user_version", 999))
        .unwrap();
    assert!(matches!(
        Db::open(&path),
        Err(DbError::NewerSchema { found: 999, .. })
    ));
}

#[test]
fn opening_in_missing_directory_names_the_path() {
    let err = Db::open(std::path::Path::new("/nonexistent-dir/x/bookeeper.sqlite")).unwrap_err();
    assert!(err
        .to_string()
        .contains("/nonexistent-dir/x/bookeeper.sqlite"));
}
