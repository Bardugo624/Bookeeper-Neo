use crate::db::Db;

#[derive(Clone)]
pub struct AppState {
    pub version: &'static str,
    pub db: Db,
}

impl AppState {
    /// State backed by an in-memory database, for tests.
    pub fn for_tests() -> AppState {
        AppState {
            version: crate::VERSION,
            db: Db::open_in_memory().expect("in-memory database"),
        }
    }
}
