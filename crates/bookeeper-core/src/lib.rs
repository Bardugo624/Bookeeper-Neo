pub mod api;
pub mod audit;
pub mod auth;
pub mod backup;
pub mod covers;
pub mod db;
pub mod ebooks;
pub mod error;
pub mod extract;
pub mod import;
pub mod labels;
pub mod lookup;
pub mod openapi;
pub mod state;

pub use api::router;
pub use db::{Db, DbError};
pub use error::{ApiError, ApiErrorBody, ApiResult};
pub use extract::ApiJson;
pub use openapi::openapi;
pub use state::{AppState, Files, ServerInfo, SetupPolicy, TlsMode};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
