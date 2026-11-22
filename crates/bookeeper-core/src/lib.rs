pub mod api;
pub mod state;

pub use api::router;
pub use state::AppState;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
