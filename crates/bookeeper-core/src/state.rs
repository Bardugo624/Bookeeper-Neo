use std::fmt;
use std::sync::Arc;

use rand::RngCore;

use crate::db::{Db, DbError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetupPolicy {
    Open,
    CodeRequired,
}

#[derive(Clone)]
pub struct AppState {
    pub version: &'static str,
    pub db: Db,
    pub jwt_secret: Arc<[u8]>,
    pub setup_policy: SetupPolicy,
}

// Manual impl so the signing secret can never leak through `{:?}`.
impl fmt::Debug for AppState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AppState")
            .field("version", &self.version)
            .field("db", &self.db)
            .field("jwt_secret", &"<redacted>")
            .field("setup_policy", &self.setup_policy)
            .finish()
    }
}

fn load_secret(db: &Db) -> Result<Vec<u8>, DbError> {
    let hex_secret = db.with(|conn| {
        let mut candidate = [0u8; 32];
        rand::rng().fill_bytes(&mut candidate);
        // IGNORE keeps the first writer's value when two processes start together.
        conn.execute(
            "INSERT OR IGNORE INTO server_meta (key, value) VALUES ('jwt_secret', ?1)",
            [hex::encode(candidate)],
        )?;
        conn.query_row(
            "SELECT value FROM server_meta WHERE key = 'jwt_secret'",
            [],
            |r| r.get::<_, String>(0),
        )
    })?;
    hex::decode(hex_secret)
        .ok()
        .filter(|b| b.len() == 32)
        .ok_or_else(|| DbError::Migration("stored jwt_secret is not 32 hex-encoded bytes".into()))
}

impl AppState {
    /// Builds the state, loading (or creating) the persistent JWT secret.
    pub fn open(db: Db, setup_policy: SetupPolicy) -> Result<AppState, DbError> {
        let secret = load_secret(&db)?;
        Ok(AppState {
            version: crate::VERSION,
            db,
            jwt_secret: Arc::from(secret),
            setup_policy,
        })
    }

    /// State backed by an in-memory database, for tests.
    pub fn for_tests() -> AppState {
        let db = Db::open_in_memory().expect("in-memory database");
        AppState::open(db, SetupPolicy::Open).expect("app state")
    }
}
