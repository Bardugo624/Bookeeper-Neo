//! Standalone Bookeeper server: wires the core router to a data directory and a TCP port.

use std::io;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

use bookeeper_core::{router, AppState, Db, DbError, SetupPolicy, VERSION};
use clap::Parser;
use tokio::net::TcpListener;

mod web;
pub use web::web_routes;

/// Runtime configuration, from flags or `BOOKEEPER_*` environment variables.
#[derive(Debug, Clone, Parser)]
#[command(name = "bookeeper-server", version = VERSION)]
pub struct Config {
    /// Directory holding the database (created if missing).
    #[arg(long, env = "BOOKEEPER_DATA", default_value = "./data")]
    pub data_dir: PathBuf,
    /// Address to listen on.
    #[arg(long, env = "BOOKEEPER_BIND", default_value = "0.0.0.0")]
    pub bind: IpAddr,
    /// Port to listen on.
    #[arg(long, env = "BOOKEEPER_PORT", default_value_t = 7842)]
    pub port: u16,
}

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error("cannot use data directory {}: {source}", path.display())]
    DataDir { path: PathBuf, source: io::Error },
    #[error("cannot listen on {addr} (port {}): {source}", addr.port())]
    Bind { addr: SocketAddr, source: io::Error },
    #[error("{0}")]
    Db(#[from] DbError),
}

/// Creates the data directory if missing, opens the database and builds the router.
pub fn build(cfg: &Config) -> Result<axum::Router, StartError> {
    std::fs::create_dir_all(&cfg.data_dir).map_err(|source| StartError::DataDir {
        path: cfg.data_dir.clone(),
        source,
    })?;
    let db = Db::open(&cfg.data_dir.join("bookeeper.sqlite"))?;
    // The core router already has a JSON fallback and `merge` panics when both sides
    // have one: drop the core's so `web_routes()` carries the only fallback (which
    // still answers `/api/*` with the JSON 404).
    Ok(router(AppState::open(db, SetupPolicy::CodeRequired)?)
        .reset_fallback()
        .merge(web_routes()))
}

/// Binds the TCP listener on the configured address and port.
pub async fn bind(cfg: &Config) -> Result<TcpListener, StartError> {
    let addr = SocketAddr::new(cfg.bind, cfg.port);
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
async fn shutdown_signal() {
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
