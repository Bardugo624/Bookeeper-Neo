use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

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

fn migrations() -> Migrations<'static> {
    Migrations::new(MIGRATIONS.iter().map(|sql| M::up(sql)).collect())
}

impl Db {
    /// Opens (or creates) the database file. Does not create missing directories.
    pub fn open(path: &Path) -> Result<Db, DbError> {
        let conn = Connection::open(path).map_err(|source| DbError::Open {
            path: path.to_path_buf(),
            source,
        })?;
        Self::init(conn, true).map_err(|e| match e {
            DbError::Sqlite(source) => DbError::Open {
                path: path.to_path_buf(),
                source,
            },
            other => other,
        })
    }

    pub fn open_in_memory() -> Result<Db, DbError> {
        Self::init(Connection::open_in_memory()?, false)
    }

    fn init(mut conn: Connection, wal: bool) -> Result<Db, DbError> {
        conn.pragma_update(None, "foreign_keys", true)?;
        // Refuse newer schemas before any write (including the journal mode switch).
        let found: usize = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if found > SUPPORTED_VERSION {
            return Err(DbError::NewerSchema {
                found,
                supported: SUPPORTED_VERSION,
            });
        }
        if wal {
            conn.pragma_update(None, "journal_mode", "WAL")?;
        }
        migrations()
            .to_latest(&mut conn)
            .map_err(|e| DbError::Migration(e.to_string()))?;
        Ok(Db {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn with<R>(
        &self,
        f: impl FnOnce(&mut Connection) -> rusqlite::Result<R>,
    ) -> Result<R, DbError> {
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        Ok(f(&mut conn)?)
    }
}
