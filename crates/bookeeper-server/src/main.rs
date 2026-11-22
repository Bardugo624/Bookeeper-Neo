use bookeeper_core::VERSION;
use bookeeper_server::{bind, build, serve, Config, StartError};
use clap::Parser;

async fn run(cfg: Config) -> Result<(), StartError> {
    let app = build(&cfg)?;
    let listener = bind(&cfg).await?;
    let addr = listener.local_addr().map_err(|source| StartError::Bind {
        addr: std::net::SocketAddr::new(cfg.bind, cfg.port),
        source,
    })?;
    println!("Bookeeper {VERSION} in ascolto su http://{addr}");
    if let Err(e) = serve(listener, app).await {
        tracing::error!(error = %e, "server stopped with an error");
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    if let Err(e) = run(Config::parse()).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
