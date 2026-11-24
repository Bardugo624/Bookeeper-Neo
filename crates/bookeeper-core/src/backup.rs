//! Library backup and restore.
//!
//! An archive is a zip with `manifest.json`, `data.json` (one list of rows per domain
//! table, plus reduced `users`) and `covers/<book id>.jpg`. Restoring replaces the data
//! of the requester's library in a single transaction.
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use std::path::Path;

use rusqlite::types::Value as Sql;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use utoipa::ToSchema;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::auth::guard::AuthUser;
use crate::covers::{self, Processed};
use crate::state::Files;

pub const FORMAT: &str = "bookeeper-backup";
pub const FORMAT_VERSION: i64 = 1;
/// Largest archive accepted by the restore route.
pub const MAX_ARCHIVE_BYTES: usize = 200 * 1024 * 1024;

const MAX_ENTRIES: usize = 100_000;
const MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    /// The archive is unreadable, hostile or inconsistent. Nothing was changed.
    #[error("invalid archive: {0}")]
    Invalid(String),
    #[error("database error: {0}")]
    Db(rusqlite::Error),
    #[error("cannot build the archive: {0}")]
    Archive(String),
}

impl From<rusqlite::Error> for BackupError {
    fn from(e: rusqlite::Error) -> Self {
        match &e {
            rusqlite::Error::SqliteFailure(f, _)
                if f.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                BackupError::Invalid("a row violates a constraint".into())
            }
            _ => BackupError::Db(e),
        }
    }
}

fn invalid<T>(msg: &str) -> Result<T, BackupError> {
    Err(BackupError::Invalid(msg.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct RestoreReport {
    pub books: i64,
    pub shelves: i64,
    pub loans: i64,
    pub wishlist: i64,
    pub covers: i64,
    /// Archive users that do not exist in this library.
    pub users_remapped: i64,
}

// ------------------------------------------------------------------ table layout

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// Required server-style identifier.
    Id,
    /// Nullable identifier.
    OptId,
    Text,
    Int,
}

use Kind::{Id, Int, OptId, Text};

struct Table {
    name: &'static str,
    cols: &'static [(&'static str, Kind)],
    /// FROM/WHERE part selecting the rows of one library (`?1`), the table aliased `t`.
    from: &'static str,
}

const TABLES: [Table; 9] = [
    Table {
        name: "rooms",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("name", Text),
            ("created_at", Int),
        ],
        from: "rooms t WHERE t.library_id = ?1",
    },
    Table {
        name: "shelves",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("room_id", OptId),
            ("name", Text),
            ("rows", Int),
            ("slots_per_row", Int),
            ("color", Text),
            ("icon", Text),
            ("label_code", Int),
            ("created_at", Int),
            ("updated_at", Int),
        ],
        from: "shelves t WHERE t.library_id = ?1",
    },
    Table {
        name: "tags",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("name", Text),
            ("color", Text),
        ],
        from: "tags t WHERE t.library_id = ?1",
    },
    Table {
        name: "books",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("isbn_13", Text),
            ("isbn_10", Text),
            ("title", Text),
            ("subtitle", Text),
            ("authors_json", Text),
            ("publisher", Text),
            ("published_year", Int),
            ("language", Text),
            ("page_count", Int),
            ("description", Text),
            ("genre", Text),
            ("format", Text),
            ("progressive_number", Int),
            ("owner_user_id", OptId),
            ("condition", Text),
            ("acquired_at", Int),
            ("price_cents", Int),
            ("notes", Text),
            ("cover_file", Text),
            ("cover_color", Text),
            ("created_at", Int),
            ("updated_at", Int),
        ],
        from: "books t WHERE t.library_id = ?1",
    },
    Table {
        name: "shelf_books",
        cols: &[
            ("book_id", Id),
            ("shelf_id", Id),
            ("row_index", Int),
            ("slot_index", Int),
            ("spine_width", Int),
            ("updated_at", Int),
        ],
        from: "shelf_books t JOIN shelves s ON s.id = t.shelf_id WHERE s.library_id = ?1",
    },
    Table {
        name: "loans",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("book_id", Id),
            ("borrower_name", Text),
            ("borrower_user_id", OptId),
            ("lent_at", Int),
            ("due_at", Int),
            ("returned_at", Int),
            ("notes", Text),
        ],
        from: "loans t WHERE t.library_id = ?1",
    },
    Table {
        name: "wishlist",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("user_id", Id),
            ("isbn", Text),
            ("title", Text),
            ("authors", Text),
            ("source_url", Text),
            ("priority", Int),
            ("notes", Text),
            ("created_at", Int),
        ],
        from: "wishlist t WHERE t.library_id = ?1",
    },
    Table {
        name: "reading",
        cols: &[
            ("id", Id),
            ("library_id", Text),
            ("user_id", Id),
            ("book_id", Id),
            ("status", Text),
            ("started_at", Int),
            ("finished_at", Int),
            ("rating", Int),
            ("note", Text),
            ("updated_at", Int),
        ],
        from: "reading t WHERE t.library_id = ?1",
    },
    Table {
        name: "book_tags",
        cols: &[("book_id", Id), ("tag_id", Id)],
        from: "book_tags t JOIN books b ON b.id = t.book_id WHERE b.library_id = ?1",
    },
];

const T_ROOMS: usize = 0;
const T_SHELVES: usize = 1;
const T_TAGS: usize = 2;
const T_BOOKS: usize = 3;
const T_SHELF_BOOKS: usize = 4;
const T_LOANS: usize = 5;
const T_WISHLIST: usize = 6;
const T_READING: usize = 7;
const T_BOOK_TAGS: usize = 8;

const USER_COLS: [(&str, Kind); 3] = [("id", Id), ("display_name", Text), ("role", Text)];

fn is_plain_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

// ------------------------------------------------------------------ creating

fn to_json(v: rusqlite::types::ValueRef<'_>) -> Value {
    use rusqlite::types::ValueRef;
    match v {
        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
    }
}

fn dump(
    conn: &Connection,
    library_id: &str,
    cols: &[(&str, Kind)],
    from: &str,
) -> rusqlite::Result<Vec<Value>> {
    let list = cols
        .iter()
        .map(|(c, _)| format!("t.{c}"))
        .collect::<Vec<_>>()
        .join(", ");
    let mut stmt = conn.prepare(&format!("SELECT {list} FROM {from} ORDER BY t.rowid"))?;
    let mut rows = stmt.query([library_id])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = Map::new();
        for (i, (name, _)) in cols.iter().enumerate() {
            obj.insert((*name).to_string(), to_json(row.get_ref(i)?));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

fn zip_err(e: impl std::fmt::Display) -> BackupError {
    BackupError::Archive(e.to_string())
}

/// File name of a backup download: `bookeeper-<library>-<YYYYMMDD-HHMMSS>.zip`.
pub fn archive_filename(conn: &Connection, library_id: &str, now: i64) -> rusqlite::Result<String> {
    let name: String = conn.query_row(
        "SELECT name FROM libraries WHERE id = ?1",
        [library_id],
        |r| r.get(0),
    )?;
    let stamp = chrono::DateTime::from_timestamp(now, 0)
        .unwrap_or_default()
        .format("%Y%m%d-%H%M%S");
    Ok(format!("bookeeper-{name}-{stamp}.zip"))
}

/// Builds the archive of a library. Reads happen in one read-only transaction, so the
/// archive is consistent even with writes going on.
pub fn create_archive(
    conn: &Connection,
    files: &Files,
    library_id: &str,
    now: i64,
) -> Result<Vec<u8>, BackupError> {
    let tx = conn.unchecked_transaction()?;
    let (lib_name, lib_id): (String, String) = tx.query_row(
        "SELECT name, id FROM libraries WHERE id = ?1",
        [library_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let mut data = Map::new();
    let mut counts = Map::new();
    for t in &TABLES {
        let rows = dump(&tx, library_id, t.cols, t.from)?;
        counts.insert(t.name.to_string(), json!(rows.len()));
        data.insert(t.name.to_string(), Value::Array(rows));
    }
    let users = dump(
        &tx,
        library_id,
        &USER_COLS,
        "users t WHERE t.library_id = ?1",
    )?;
    counts.insert("users".into(), json!(users.len()));
    data.insert("users".into(), Value::Array(users));

    let cover_ids: Vec<String> = {
        let mut stmt = tx.prepare(
            "SELECT id FROM books WHERE library_id = ?1 AND cover_file IS NOT NULL ORDER BY rowid",
        )?;
        let ids = stmt.query_map([library_id], |r| r.get(0))?;
        ids.collect::<rusqlite::Result<_>>()?
    };
    tx.rollback()?;

    let mut covers_found: Vec<(String, Vec<u8>)> = Vec::new();
    for id in cover_ids {
        let Some(path) = covers::cover_path(&files.covers_dir, &id) else {
            continue;
        };
        match std::fs::read(&path) {
            Ok(bytes) => covers_found.push((id, bytes)),
            Err(e) => tracing::warn!(error = %e, "cover file missing from the backup"),
        }
    }
    counts.insert("covers".into(), json!(covers_found.len()));

    let manifest = json!({
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "app_version": crate::VERSION,
        "created_at": now,
        "library": { "id": lib_id, "name": lib_name },
        "counts": counts,
    });

    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file("manifest.json", deflated).map_err(zip_err)?;
    zip.write_all(manifest.to_string().as_bytes())
        .map_err(zip_err)?;
    zip.start_file("data.json", deflated).map_err(zip_err)?;
    zip.write_all(Value::Object(data).to_string().as_bytes())
        .map_err(zip_err)?;
    for (id, bytes) in covers_found {
        zip.start_file(format!("covers/{id}.jpg"), stored)
            .map_err(zip_err)?;
        zip.write_all(&bytes).map_err(zip_err)?;
    }
    Ok(zip.finish().map_err(zip_err)?.into_inner())
}

// ------------------------------------------------------------------ reading

type Row = HashMap<&'static str, Sql>;

#[derive(PartialEq, Eq)]
enum Entry {
    Manifest,
    Data,
    CoversDir,
    Cover,
}

fn classify(name: &str) -> Result<Entry, BackupError> {
    if name.is_empty() || name.contains('\0') || name.contains('\\') || name.starts_with('/') {
        return invalid("entry with an unsafe path");
    }
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || *p == "." || *p == "..")
    {
        return invalid("entry with an unsafe path");
    }
    let is_dir = trimmed.len() != name.len();
    match (parts.as_slice(), is_dir) {
        (["manifest.json"], false) => Ok(Entry::Manifest),
        (["data.json"], false) => Ok(Entry::Data),
        (["covers"], true) => Ok(Entry::CoversDir),
        (["covers", _], false) => Ok(Entry::Cover),
        _ => invalid("entry outside of covers/"),
    }
}

/// Reads one entry, enforcing the per-entry and total limits while decompressing.
/// With `keep` false the content is only counted.
fn read_entry<R: Read>(entry: R, total: &mut u64, keep: bool) -> Result<Vec<u8>, BackupError> {
    let mut limited = entry.take(MAX_ENTRY_BYTES + 1);
    let mut buf = Vec::new();
    let n = if keep {
        limited
            .read_to_end(&mut buf)
            .map_err(|_| BackupError::Invalid("unreadable entry".into()))? as u64
    } else {
        std::io::copy(&mut limited, &mut std::io::sink())
            .map_err(|_| BackupError::Invalid("unreadable entry".into()))?
    };
    if n > MAX_ENTRY_BYTES {
        return invalid("entry too large");
    }
    *total += n;
    if *total > MAX_TOTAL_BYTES {
        return invalid("archive too large once decompressed");
    }
    Ok(buf)
}

fn to_sql(v: &Value, kind: Kind) -> Result<Sql, BackupError> {
    match (v, kind) {
        (Value::Null, Id) => invalid("missing identifier"),
        (Value::Null, _) => Ok(Sql::Null),
        (Value::String(s), Id | OptId) if is_plain_id(s) => Ok(Sql::Text(s.clone())),
        (Value::String(s), Text) => Ok(Sql::Text(s.clone())),
        (Value::Number(n), Int) => match n.as_i64() {
            Some(i) => Ok(Sql::Integer(i)),
            None => invalid("non-integer number"),
        },
        _ => invalid("value of the wrong type"),
    }
}

fn parse_rows(
    value: Option<&Value>,
    cols: &'static [(&'static str, Kind)],
) -> Result<Vec<Row>, BackupError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = value else {
        return invalid("a table is not a list");
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let Value::Object(obj) = item else {
            return invalid("a row is not an object");
        };
        let mut row = Row::new();
        for (key, v) in obj {
            let Some((name, kind)) = cols.iter().find(|(c, _)| c == key) else {
                return invalid("unknown column");
            };
            row.insert(name, to_sql(v, *kind)?);
        }
        // A required identifier must be present, not merely valid.
        for (name, kind) in cols {
            if *kind == Id && !row.contains_key(name) {
                return invalid("missing identifier");
            }
        }
        out.push(row);
    }
    Ok(out)
}

struct Parsed {
    tables: Vec<Vec<Row>>,
    users: Vec<Row>,
    covers: HashMap<String, Processed>,
}

fn parse_archive(bytes: &[u8]) -> Result<Parsed, BackupError> {
    let mut zip = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| BackupError::Invalid("not a readable zip".into()))?;
    if zip.len() > MAX_ENTRIES {
        return invalid("too many entries");
    }
    let mut kinds = Vec::with_capacity(zip.len());
    let mut seen = HashSet::new();
    for i in 0..zip.len() {
        let name = zip
            .name_for_index(i)
            .ok_or_else(|| BackupError::Invalid("unreadable entry".into()))?
            .to_string();
        let kind = classify(&name)?;
        if !seen.insert(name) {
            return invalid("duplicate entry");
        }
        kinds.push(kind);
    }
    let find = |want: Entry| kinds.iter().position(|k| *k == want);
    let (Some(mi), Some(di)) = (find(Entry::Manifest), find(Entry::Data)) else {
        return invalid("manifest or data missing");
    };

    let mut total = 0u64;
    let manifest = {
        let entry = zip
            .by_index(mi)
            .map_err(|_| BackupError::Invalid("unreadable manifest".into()))?;
        read_entry(entry, &mut total, true)?
    };
    let manifest: Value = serde_json::from_slice(&manifest)
        .map_err(|_| BackupError::Invalid("manifest is not JSON".into()))?;
    if manifest["format"] != FORMAT || manifest["format_version"] != FORMAT_VERSION {
        return invalid("unknown archive format or version");
    }
    let data = {
        let entry = zip
            .by_index(di)
            .map_err(|_| BackupError::Invalid("unreadable data".into()))?;
        read_entry(entry, &mut total, true)?
    };
    let data: Value = serde_json::from_slice(&data)
        .map_err(|_| BackupError::Invalid("data is not JSON".into()))?;
    let Value::Object(data) = data else {
        return invalid("data is not an object");
    };
    for key in data.keys() {
        if key != "users" && !TABLES.iter().any(|t| t.name == key) {
            return invalid("unknown table");
        }
    }
    let tables = TABLES
        .iter()
        .map(|t| parse_rows(data.get(t.name), t.cols))
        .collect::<Result<Vec<_>, _>>()?;
    let users = parse_rows(data.get("users"), &USER_COLS)?;

    let book_ids: HashSet<String> = tables[T_BOOKS]
        .iter()
        .filter_map(|r| match r.get("id") {
            Some(Sql::Text(s)) => Some(s.clone()),
            _ => None,
        })
        .collect();
    let mut covers_map = HashMap::new();
    for (i, kind) in kinds.iter().enumerate() {
        if *kind != Entry::Cover {
            continue;
        }
        let mut entry = zip
            .by_index(i)
            .map_err(|_| BackupError::Invalid("unreadable cover".into()))?;
        // The file name only selects the book; it is never used on disk.
        let stem = entry
            .name()
            .strip_prefix("covers/")
            .and_then(|f| f.rsplit_once('.').map(|(s, _)| s.to_string()))
            .unwrap_or_default();
        let wanted = book_ids.contains(&stem) && !covers_map.contains_key(&stem);
        let raw = read_entry(&mut entry, &mut total, wanted)?;
        if wanted {
            let processed = covers::process(&raw)
                .map_err(|_| BackupError::Invalid("a cover is not a valid image".into()))?;
            covers_map.insert(stem, processed);
        }
    }
    Ok(Parsed {
        tables,
        users,
        covers: covers_map,
    })
}

// ------------------------------------------------------------------ restoring

fn text_of(row: &Row, col: &str) -> Option<String> {
    match row.get(col) {
        Some(Sql::Text(s)) => Some(s.clone()),
        _ => None,
    }
}

fn insert_row(tx: &rusqlite::Transaction<'_>, table: &Table, row: &Row) -> rusqlite::Result<()> {
    let present: Vec<&str> = table
        .cols
        .iter()
        .map(|(c, _)| *c)
        .filter(|c| row.contains_key(c))
        .collect();
    let marks = (1..=present.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({marks})",
        table.name,
        present.join(", ")
    );
    let mut stmt = tx.prepare_cached(&sql)?;
    stmt.execute(rusqlite::params_from_iter(
        present.iter().map(|c| row[c].clone()),
    ))?;
    Ok(())
}

fn fts_insert(tx: &rusqlite::Transaction<'_>, rowid: i64, row: &Row) -> rusqlite::Result<()> {
    let authors: Vec<String> = text_of(row, "authors_json")
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default();
    let isbn = ["isbn_13", "isbn_10"]
        .iter()
        .filter_map(|c| text_of(row, c))
        .collect::<Vec<_>>()
        .join(" ");
    tx.execute(
        "INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            rowid,
            text_of(row, "title"),
            text_of(row, "subtitle"),
            authors.join(" "),
            text_of(row, "description"),
            text_of(row, "notes"),
            isbn
        ],
    )?;
    Ok(())
}

fn remap(
    map: &HashMap<String, String>,
    row: &mut Row,
    col: &'static str,
) -> Result<(), BackupError> {
    if let Some(Sql::Text(old)) = row.get(col) {
        match map.get(old) {
            Some(new) => {
                row.insert(col, Sql::Text(new.clone()));
            }
            None => return invalid("a row refers to a missing record"),
        }
    }
    Ok(())
}

/// Replaces the library's data with the archive's, in one transaction.
pub fn restore_archive(
    conn: &mut Connection,
    files: &Files,
    who: &AuthUser,
    bytes: &[u8],
    now: i64,
) -> Result<RestoreReport, BackupError> {
    let Parsed {
        mut tables,
        users,
        covers: processed,
    } = parse_archive(bytes)?;
    let lib = who.library_id.as_str();

    let tx = conn.transaction()?;
    let current_users: HashSet<String> = {
        let mut stmt = tx.prepare("SELECT id FROM users WHERE library_id = ?1")?;
        let ids = stmt.query_map([lib], |r| r.get(0))?;
        ids.collect::<rusqlite::Result<_>>()?
    };
    let old_books: Vec<String> = {
        let mut stmt = tx.prepare("SELECT id FROM books WHERE library_id = ?1")?;
        let ids = stmt.query_map([lib], |r| r.get(0))?;
        ids.collect::<rusqlite::Result<_>>()?
    };

    tx.execute(
        "DELETE FROM books_fts WHERE rowid IN (SELECT rowid FROM books WHERE library_id = ?1)",
        [lib],
    )?;
    for sql in [
        "DELETE FROM book_tags WHERE book_id IN (SELECT id FROM books WHERE library_id = ?1)",
        "DELETE FROM shelf_books WHERE shelf_id IN (SELECT id FROM shelves WHERE library_id = ?1)",
        "DELETE FROM loans WHERE library_id = ?1",
        "DELETE FROM reading WHERE library_id = ?1",
        "DELETE FROM wishlist WHERE library_id = ?1",
        "DELETE FROM books WHERE library_id = ?1",
        "DELETE FROM shelves WHERE library_id = ?1",
        "DELETE FROM rooms WHERE library_id = ?1",
        "DELETE FROM tags WHERE library_id = ?1",
    ] {
        tx.execute(sql, [lib])?;
    }

    // New ids: kept unless the id is taken by another library of this server.
    let mut maps: HashMap<usize, HashMap<String, String>> = HashMap::new();
    for ti in [
        T_ROOMS, T_SHELVES, T_TAGS, T_BOOKS, T_LOANS, T_WISHLIST, T_READING,
    ] {
        let mut map = HashMap::new();
        for row in &tables[ti] {
            let Some(old) = text_of(row, "id") else {
                return invalid("missing identifier");
            };
            let taken = tx
                .query_row(
                    &format!("SELECT 1 FROM {} WHERE id = ?1", TABLES[ti].name),
                    [&old],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            let new = if taken {
                uuid::Uuid::now_v7().to_string()
            } else {
                old.clone()
            };
            if map.insert(old, new).is_some() {
                return invalid("duplicate identifier");
            }
        }
        maps.insert(ti, map);
    }

    // Users: kept when they exist in this library, otherwise replaced.
    let mut replaced: HashSet<String> = HashSet::new();
    for u in &users {
        if let Some(id) = text_of(u, "id") {
            if !current_users.contains(&id) {
                replaced.insert(id);
            }
        }
    }
    let mut user_ref = |row: &mut Row, col: &'static str, fallback: Option<&str>| {
        let Some(Sql::Text(u)) = row.get(col) else {
            return;
        };
        if current_users.contains(u) {
            return;
        }
        replaced.insert(u.clone());
        row.insert(
            col,
            fallback.map_or(Sql::Null, |f| Sql::Text(f.to_string())),
        );
    };

    let mut covered: HashMap<String, Processed> = HashMap::new();
    let mut counts = RestoreReport {
        books: 0,
        shelves: 0,
        loans: 0,
        wishlist: 0,
        covers: 0,
        users_remapped: 0,
    };
    let mut reading_seen: HashSet<(String, String)> = HashSet::new();

    for ti in 0..TABLES.len() {
        let table = &TABLES[ti];
        let mut rows = std::mem::take(&mut tables[ti]);
        for row in &mut rows {
            let archive_id = text_of(row, "id");
            if table.cols.iter().any(|(c, _)| *c == "library_id") {
                row.insert("library_id", Sql::Text(lib.to_string()));
            }
            match ti {
                T_SHELVES => remap(&maps[&T_ROOMS], row, "room_id")?,
                T_SHELF_BOOKS => {
                    remap(&maps[&T_BOOKS], row, "book_id")?;
                    remap(&maps[&T_SHELVES], row, "shelf_id")?;
                }
                T_LOANS => {
                    remap(&maps[&T_BOOKS], row, "book_id")?;
                    user_ref(row, "borrower_user_id", None);
                }
                T_WISHLIST => user_ref(row, "user_id", Some(&who.user_id)),
                T_READING => {
                    remap(&maps[&T_BOOKS], row, "book_id")?;
                    user_ref(row, "user_id", Some(&who.user_id));
                }
                T_BOOK_TAGS => {
                    remap(&maps[&T_BOOKS], row, "book_id")?;
                    remap(&maps[&T_TAGS], row, "tag_id")?;
                }
                T_BOOKS => user_ref(row, "owner_user_id", None),
                _ => {}
            }
            if let Some(map) = maps.get(&ti) {
                remap(map, row, "id")?;
            }
            if ti == T_READING {
                let key = (
                    text_of(row, "user_id").unwrap_or_default(),
                    text_of(row, "book_id").unwrap_or_default(),
                );
                if !reading_seen.insert(key) {
                    continue;
                }
            }
            if ti == T_BOOKS {
                // Cover columns are derived from the archive's image, never copied.
                match archive_id.as_ref().and_then(|o| processed.get(o)) {
                    Some(p) => {
                        let id = text_of(row, "id").unwrap_or_default();
                        row.insert("cover_file", Sql::Text(format!("{id}.jpg")));
                        row.insert("cover_color", Sql::Text(p.color.clone()));
                        covered.insert(
                            id,
                            Processed {
                                jpeg: p.jpeg.clone(),
                                color: p.color.clone(),
                            },
                        );
                    }
                    None => {
                        row.insert("cover_file", Sql::Null);
                        row.insert("cover_color", Sql::Null);
                    }
                }
            }
            insert_row(&tx, table, row)?;
            match ti {
                T_BOOKS => {
                    fts_insert(&tx, tx.last_insert_rowid(), row)?;
                    counts.books += 1;
                }
                T_SHELVES => counts.shelves += 1,
                T_LOANS => counts.loans += 1,
                T_WISHLIST => counts.wishlist += 1,
                _ => {}
            }
        }
    }
    counts.covers = covered.len() as i64;
    counts.users_remapped = replaced.len() as i64;

    crate::audit::record(
        &tx,
        who,
        "library.restore",
        "library",
        lib,
        Some(&json!({
            "books": counts.books,
            "shelves": counts.shelves,
            "loans": counts.loans,
            "wishlist": counts.wishlist,
            "covers": counts.covers,
        })),
        now,
    )?;
    tx.commit()?;

    write_covers(&files.covers_dir, &covered, &old_books);
    Ok(counts)
}

/// Replaces the cover files after the commit: the new ones are written to a temporary
/// folder and renamed in, those of books that are gone are removed. Failures are logged.
fn write_covers(dir: &Path, covered: &HashMap<String, Processed>, old_books: &[String]) {
    let tmp = dir.join(format!(".restore-{}", uuid::Uuid::now_v7()));
    if let Err(e) = std::fs::create_dir_all(&tmp) {
        tracing::error!(error = %e, "cannot create the temporary cover folder");
        return;
    }
    for (id, p) in covered {
        let Some(target) = covers::cover_path(dir, id) else {
            continue;
        };
        let Some(staged) = covers::cover_path(&tmp, id) else {
            continue;
        };
        let res = std::fs::write(&staged, &p.jpeg).and_then(|()| std::fs::rename(&staged, &target));
        if let Err(e) = res {
            tracing::error!(error = %e, "cannot restore a cover file");
        }
    }
    let stale: Vec<String> = old_books
        .iter()
        .filter(|id| !covered.contains_key(*id))
        .cloned()
        .collect();
    covers::remove_files(dir, &stale);
    let _ = std::fs::remove_dir_all(&tmp);
}
