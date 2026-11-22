use bookeeper_core::VERSION;
use bookeeper_server::{bind, build, serve, Config, StartError};
use clap::Parser;

async fn run(cfg: Config) -> Result<(), StartError> {
    // Bind first: a busy port must not leave a freshly created data directory behind.
    let listener = bind(&cfg).await?;
    let app = build(&cfg)?;
    let addr = listener.local_addr().map_err(|source| StartError::Bind {
        addr: std::net::SocketAddr::new(cfg.bind, cfg.port),
        source,
    })?;
    println!("Bookeeper {VERSION} in ascolto su http://{addr}");
    if let Err(e) = serve(listener, app).await {
        eprintln!("error: {e}");
        std::process::exit(1);
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
