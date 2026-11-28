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
    "annotations",
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

#[test]
fn concurrent_first_opens_all_succeed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bookeeper.sqlite");
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let path = path.clone();
            std::thread::spawn(move || Db::open(&path).map(|_| ()))
        })
        .collect();
    for h in handles {
        h.join().unwrap().unwrap();
    }
    let n: i64 = Db::open(&path)
        .unwrap()
        .with(|c| {
            c.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'books'",
                [],
                |r| r.get(0),
            )
        })
        .unwrap();
    assert_eq!(n, 1);
}

#[test]
fn a_panic_inside_with_does_not_leave_a_transaction_open() {
    let db = Db::open_in_memory().unwrap();
    let db2 = db.clone();
    let _ = std::thread::spawn(move || {
        let _ = db2.with(|c| {
            c.execute_batch("BEGIN; INSERT INTO libraries VALUES ('l','Casa',0);")?;
            panic!("boom");
            #[allow(unreachable_code)]
            Ok(())
        });
    })
    .join();
    let n: i64 = db
        .with(|c| c.query_row("SELECT count(*) FROM libraries", [], |r| r.get(0)))
        .unwrap();
    assert_eq!(n, 0);
    assert!(db.with(|c| Ok(c.is_autocommit())).unwrap());
}

#[test]
fn a_version_1_database_is_migrated_without_losing_data() {
    let dir = std::env::temp_dir().join(format!("bk-db-v1-{}", uuid::Uuid::now_v7()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("old.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../src/db/migrations/0001_schema.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.execute_batch(
            "INSERT INTO libraries VALUES ('l','Casa',0);
             INSERT INTO users (id,library_id,display_name,role,created_at) VALUES ('u','l','A','owner',0);
             INSERT INTO books (id,library_id,title,created_at,updated_at) VALUES ('b','l','Dune',0,0);
             INSERT INTO reading (id,library_id,user_id,book_id,status,rating,updated_at)
               VALUES ('r','l','u','b','read',5,9);",
        )
        .unwrap();
    }
    let db = Db::open(&path).unwrap();
    let (title, status, rating, page, version): (String, String, i64, Option<i64>, i64) = db
        .with(|c| {
            c.query_row(
                "SELECT (SELECT title FROM books), status, rating, current_page, \
                 (SELECT user_version FROM pragma_user_version) FROM reading",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
        })
        .unwrap();
    assert_eq!(
        (title.as_str(), status.as_str(), rating, page),
        ("Dune", "read", 5, None)
    );
    assert_eq!(version, 6);
    assert!(db
        .with(|c| c.execute("UPDATE reading SET current_page = -1", []))
        .is_err());
    db.with(|c| c.execute("UPDATE reading SET current_page = 10", []))
        .unwrap();
    drop(db);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn ulower_folds_unicode() {
    let db = Db::open_in_memory().unwrap();
    let v: String = db
        .with(|c| c.query_row("SELECT ulower('ÉTICA')", [], |r| r.get(0)))
        .unwrap();
    assert_eq!(v, "ética");
}

#[test]
fn migration_0003_applies_to_a_populated_version_2_database() {
    let dir = std::env::temp_dir().join(format!("bk-db-v2-{}", uuid::Uuid::now_v7()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("old.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../src/db/migrations/0001_schema.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../src/db/migrations/0002_reading_progress.sql"
        ))
        .unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
        conn.execute_batch(
            "INSERT INTO libraries VALUES ('l','Casa',0);
             INSERT INTO users (id,library_id,display_name,role,created_at) VALUES ('u','l','A','owner',0);
             INSERT INTO pairing_codes (code_hash,library_id,kind,user_id,created_by,expires_at,created_at)
               VALUES ('h1','l','device','u','u',99,0);
             INSERT INTO pairing_codes (code_hash,library_id,kind,role,created_by,expires_at,created_at)
               VALUES ('h2','l','invite','guest','u',99,0);",
        )
        .unwrap();
    }
    let db = Db::open(&path).unwrap();
    // Old rows survive with no id.
    let (rows, with_id, version): (i64, i64, i64) = db
        .with(|c| {
            c.query_row(
                "SELECT count(*), count(id), (SELECT user_version FROM pragma_user_version)
                 FROM pairing_codes",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
        })
        .unwrap();
    assert_eq!((rows, with_id, version), (2, 0, 6));
    // New rows take an id; the id is unique, a missing one is not.
    db.with(|c| {
        c.execute(
            "UPDATE pairing_codes SET id = 'x' WHERE code_hash = 'h1'",
            [],
        )
    })
    .unwrap();
    assert!(db
        .with(|c| c.execute(
            "UPDATE pairing_codes SET id = 'x' WHERE code_hash = 'h2'",
            []
        ))
        .is_err());
    drop(db);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn migration_0005_applies_to_a_populated_version_4_database() {
    let dir = std::env::temp_dir().join(format!("bk-db-v4-{}", uuid::Uuid::now_v7()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("old.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../src/db/migrations/0001_schema.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../src/db/migrations/0002_reading_progress.sql"
        ))
        .unwrap();
        conn.execute_batch(include_str!("../src/db/migrations/0003_invites.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../src/db/migrations/0004_perf.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 4).unwrap();
        conn.execute_batch(
            "INSERT INTO libraries VALUES ('l','Casa',0);
             INSERT INTO users (id,library_id,display_name,role,created_at) VALUES ('u','l','A','owner',0);
             INSERT INTO books (id,library_id,title,created_at,updated_at) VALUES ('b','l','Dune',0,0);
             INSERT INTO reading (id,library_id,user_id,book_id,status,updated_at)
               VALUES ('r','l','u','b','reading',9);",
        )
        .unwrap();
    }
    let db = Db::open(&path).unwrap();
    let (percent, version): (Option<f64>, i64) = db
        .with(|c| {
            c.query_row(
                "SELECT progress_percent, (SELECT user_version FROM pragma_user_version) FROM reading",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .unwrap();
    assert_eq!((percent, version), (None, 6));
    db.with(|c| {
        c.execute_batch(
            "INSERT INTO book_files (id,library_id,book_id,format,sha256,size_bytes,original_name,koreader_hash,created_at)
               VALUES ('f','l','b','epub','s',1,'a.epub','h',0);
             INSERT INTO reading_positions (id,library_id,user_id,file_id,kind,value,updated_at)
               VALUES ('p','l','u','f','cfi','x',0);
             UPDATE reading SET progress_percent = 100;",
        )
    })
    .unwrap();
    assert!(db
        .with(|c| c.execute("UPDATE reading SET progress_percent = 101", []))
        .is_err());
    assert!(db
        .with(|c| c.execute("UPDATE book_files SET format = 'txt'", []))
        .is_err());
    assert!(db
        .with(|c| c.execute("UPDATE reading_positions SET kind = 'x'", []))
        .is_err());
    // Deleting the book cascades to its files and their positions.
    db.with(|c| c.execute("DELETE FROM books", [])).unwrap();
    let n: i64 = db
        .with(|c| c.query_row("SELECT count(*) FROM reading_positions", [], |r| r.get(0)))
        .unwrap();
    assert_eq!(n, 0);
    drop(db);
    std::fs::remove_dir_all(&dir).ok();
}
