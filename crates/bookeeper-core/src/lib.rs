pub mod api;
pub mod db;
pub mod state;

pub use api::router;
pub use db::{Db, DbError};
pub use state::AppState;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
