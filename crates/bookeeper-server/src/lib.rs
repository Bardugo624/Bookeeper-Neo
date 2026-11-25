//! Standalone Bookeeper server: wires the core router to a data directory and a TCP port.

use std::io;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

use bookeeper_core::api::setup::{library_count, new_setup_code};
use bookeeper_core::{router, AppState, Db, DbError, SetupPolicy};
use tokio::net::TcpListener;

pub mod announce;
mod config;
pub mod health;
mod layers;
pub mod tls;
mod web;
pub use announce::{announcement, instance_for, Announcer};
pub use config::{Cli, Command, Config, Switch, TlsChoice};
pub use tls::{load_self_identity, self_dir, TlsServer};
pub use web::web_routes;

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error("cannot use data directory {}: {source}", path.display())]
    DataDir { path: PathBuf, source: io::Error },
    #[error("cannot listen on {addr} (port {}): {source}", addr.port())]
    Bind { addr: SocketAddr, source: io::Error },
    #[error("configurazione non valida: {0}")]
    Config(String),
    #[error("{0}")]
    Tls(String),
    #[error("{0}")]
    Db(#[from] DbError),
}

/// Opens (or creates) the database of the data directory.
pub fn open_db(data_dir: &Path) -> Result<Db, StartError> {
    std::fs::create_dir_all(data_dir).map_err(|source| StartError::DataDir {
        path: data_dir.to_path_buf(),
        source,
    })?;
    Ok(Db::open(&data_dir.join("bookeeper.sqlite"))?)
}

/// `Some(code)` if no library exists yet, otherwise `None`.
pub fn startup_setup_code(db: &Db) -> Result<Option<String>, StartError> {
    if db.with(library_count)? == 0 {
        Ok(Some(issue_setup_code(db)?))
    } else {
        Ok(None)
    }
}

/// Always generates a new setup code, replacing the previous one.
pub fn issue_setup_code(db: &Db) -> Result<String, StartError> {
    Ok(db.with(new_setup_code)?)
}

/// Creates the data directory if missing, opens the database and builds the router.
pub fn build(cfg: &Config) -> Result<axum::Router, StartError> {
    build_with_data(open_db(&cfg.data_dir)?, cfg)
}

/// Builds the router on an opened database, keeping files under `cfg.data_dir`.
pub fn build_with_data(db: Db, cfg: &Config) -> Result<axum::Router, StartError> {
    finish(app_state(db, cfg)?)
}

/// The application state for a data directory, for callers that also need to start
/// background work (the scheduled backups) on it.
pub fn app_state(db: Db, cfg: &Config) -> Result<AppState, StartError> {
    Ok(
        AppState::open_with_data(db, SetupPolicy::CodeRequired, &cfg.data_dir)?
            .with_server(cfg.server_info()),
    )
}

/// Same router as [`build_with_data`], on an existing state.
pub fn build_with_state(state: AppState) -> axum::Router {
    router_for(state)
}

fn finish(state: AppState) -> Result<axum::Router, StartError> {
    Ok(router_for(state))
}

fn router_for(state: AppState) -> axum::Router {
    // The core router already has a JSON fallback and `merge` panics when both sides
    // have one: drop the core's so `web_routes()` carries the only fallback (which
    // still answers `/api/*` with the JSON 404).
    let info = state.server.clone();
    layers::apply(router(state).reset_fallback().merge(web_routes()), &info)
}

/// Binds the TCP listener on the configured address and port.
pub async fn bind(cfg: &Config) -> Result<TcpListener, StartError> {
    let addr = SocketAddr::new(cfg.bind, cfg.listen_port());
    TcpListener::bind(addr)
        .await
        .map_err(|source| StartError::Bind { addr, source })
}

/// Serves `app` until Ctrl+C or SIGTERM, then shuts down gracefully.
pub async fn serve(listener: TcpListener, app: axum::Router) -> io::Result<()> {
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
}

/// Resolves on Ctrl+C or, on Unix, on SIGTERM (what Docker and systemd send).
pub(crate) async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut term) => {
                tokio::select! {
                    _ = ctrl_c => {}
                    _ = term.recv() => {}
                }
            }
            Err(_) => ctrl_c.await,
        }
    }
    #[cfg(not(unix))]
    ctrl_c.await;
}

/// The two certificate lines shown at startup and by `fingerprint`.
pub fn identity_lines(identity: &bookeeper_net::tls::Identity) -> [String; 2] {
    [
        format!("Impronta del certificato: {}", identity.fingerprint_hex()),
        format!(
            "Frase di verifica: {}",
            bookeeper_net::phrase::verification_phrase(&identity.fingerprint)
        ),
    ]
}
