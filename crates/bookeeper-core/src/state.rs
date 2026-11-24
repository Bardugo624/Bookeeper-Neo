use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use rand::RngCore;

use crate::auth::limit::RateLimiter;
use crate::db::{Db, DbError};
use crate::lookup::LookupService;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetupPolicy {
    Open,
    CodeRequired,
}

/// Folders where the server keeps its files.
#[derive(Clone, Debug)]
pub struct Files {
    pub covers_dir: PathBuf,
    pub backups_dir: PathBuf,
}

#[derive(Clone)]
pub struct AppState {
    pub version: &'static str,
    pub db: Db,
    pub jwt_secret: Arc<[u8]>,
    pub setup_policy: SetupPolicy,
    pub limiter: Arc<RateLimiter>,
    pub files: Arc<Files>,
    pub http: reqwest::Client,
    pub allow_private_fetch: bool,
    pub lookup: Arc<LookupService>,
}

// Manual impl so the signing secret can never leak through `{:?}`.
impl fmt::Debug for AppState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AppState")
            .field("version", &self.version)
            .field("db", &self.db)
            .field("jwt_secret", &"<redacted>")
            .field("setup_policy", &self.setup_policy)
            .field("files", &self.files)
            .field("allow_private_fetch", &self.allow_private_fetch)
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

fn build_http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("Bookeeper/{}", crate::VERSION))
        .build()
        .expect("http client")
}

fn create_dir(path: &Path) -> Result<(), DbError> {
    std::fs::create_dir_all(path).map_err(|source| DbError::Io {
        path: path.to_path_buf(),
        source,
    })
}

impl AppState {
    /// Builds the state with its files under a unique folder in the OS temp directory.
    pub fn open(db: Db, setup_policy: SetupPolicy) -> Result<AppState, DbError> {
        let dir = std::env::temp_dir().join(format!("bookeeper-{}", uuid::Uuid::now_v7()));
        AppState::open_with_data(db, setup_policy, &dir)
    }

    /// Builds the state, loading (or creating) the persistent JWT secret and
    /// creating `<data_dir>/covers` and `<data_dir>/backups`.
    pub fn open_with_data(
        db: Db,
        setup_policy: SetupPolicy,
        data_dir: &Path,
    ) -> Result<AppState, DbError> {
        let files = Files {
            covers_dir: data_dir.join("covers"),
            backups_dir: data_dir.join("backups"),
        };
        create_dir(&files.covers_dir)?;
        create_dir(&files.backups_dir)?;
        let secret = load_secret(&db)?;
        let http = build_http();
        Ok(AppState {
            version: crate::VERSION,
            db,
            jwt_secret: Arc::from(secret),
            setup_policy,
            limiter: Arc::new(RateLimiter::default()),
            files: Arc::new(files),
            lookup: Arc::new(LookupService::new(http.clone())),
            http,
            allow_private_fetch: false,
        })
    }

    /// State backed by an in-memory database, for tests.
    pub fn for_tests() -> AppState {
        let db = Db::open_in_memory().expect("in-memory database");
        let mut state = AppState::open(db, SetupPolicy::Open).expect("app state");
        state.allow_private_fetch = true;
        state
    }
}
