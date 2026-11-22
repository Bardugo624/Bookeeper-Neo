use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::{Connection, TransactionBehavior};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("cannot open database at {}: {source}", path.display())]
    Open {
        path: PathBuf,
        source: rusqlite::Error,
    },
    #[error("database schema version {found} is newer than the supported {supported}")]
    NewerSchema { found: usize, supported: usize },
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("migration failed: {0}")]
    Migration(String),
}

#[derive(Clone, Debug)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

const MIGRATIONS: &[&str] = &[include_str!("migrations/0001_schema.sql")];

/// Highest schema version this build understands.
const SUPPORTED_VERSION: usize = MIGRATIONS.len();

/// How long an opener waits for another process holding the database.
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);

fn is_busy(e: &rusqlite::Error) -> bool {
    matches!(
        e.sqlite_error_code(),
        Some(rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked)
    )
}

fn schema_version(conn: &Connection) -> rusqlite::Result<usize> {
    conn.pragma_query_value(None, "user_version", |r| r.get(0))
}

fn refuse_newer(found: usize) -> Result<(), DbError> {
    if found > SUPPORTED_VERSION {
        return Err(DbError::NewerSchema {
            found,
            supported: SUPPORTED_VERSION,
        });
    }
    Ok(())
}

/// Applies pending migrations under a write lock, so two processes opening the
/// same fresh file (double launch) cannot both run the same migration.
fn migrate(conn: &mut Connection) -> Result<(), DbError> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = schema_version(&tx)?;
    refuse_newer(current)?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        tx.execute_batch(sql)
            .map_err(|e| DbError::Migration(format!("migration {}: {e}", index + 1)))?;
        tx.pragma_update(None, "user_version", index + 1)?;
    }
    tx.commit()?;
    Ok(())
}

impl Db {
    /// Opens (or creates) the database file. Does not create missing directories.
    pub fn open(path: &Path) -> Result<Db, DbError> {
        let open_error = |source| DbError::Open {
            path: path.to_path_buf(),
            source,
        };
        // Switching a fresh file to WAL needs an exclusive lock that SQLite's busy
        // handler does not wait for, so a concurrent first open is retried here.
        let deadline = Instant::now() + BUSY_TIMEOUT;
        loop {
            let conn = Connection::open(path).map_err(open_error)?;
            match Self::init(conn, true) {
                Err(DbError::Sqlite(e)) if is_busy(&e) && Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                Err(DbError::Sqlite(source)) => return Err(open_error(source)),
                other => return other,
            }
        }
    }

    pub fn open_in_memory() -> Result<Db, DbError> {
        Self::init(Connection::open_in_memory()?, false)
    }

    fn init(mut conn: Connection, wal: bool) -> Result<Db, DbError> {
        // Wait for a concurrent opener instead of failing with SQLITE_BUSY.
        conn.busy_timeout(BUSY_TIMEOUT)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        // Refuse newer schemas before any write (including the journal mode switch).
        refuse_newer(schema_version(&conn)?)?;
        if wal {
            conn.pragma_update(None, "journal_mode", "WAL")?;
        }
        migrate(&mut conn)?;
        Ok(Db {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn with<R>(
        &self,
        f: impl FnOnce(&mut Connection) -> rusqlite::Result<R>,
    ) -> Result<R, DbError> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| {
            // A panic inside `f` may have left a manual transaction open.
            let conn = poisoned.into_inner();
            if !conn.is_autocommit() {
                let _ = conn.execute_batch("ROLLBACK");
            }
            conn
        });
        Ok(f(&mut conn)?)
    }
}
