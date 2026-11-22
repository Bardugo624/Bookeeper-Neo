pub mod api;
pub mod auth;
pub mod db;
pub mod error;
pub mod extract;
pub mod openapi;
pub mod state;

pub use api::router;
pub use db::{Db, DbError};
pub use error::{ApiError, ApiErrorBody, ApiResult};
pub use extract::ApiJson;
pub use openapi::openapi;
pub use state::{AppState, SetupPolicy};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
