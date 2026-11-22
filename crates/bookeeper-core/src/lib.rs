pub mod api;
pub mod db;
pub mod error;
pub mod state;

pub use api::router;
pub use db::{Db, DbError};
pub use error::{ApiError, ApiResult};
pub use state::AppState;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
