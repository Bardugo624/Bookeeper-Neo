use bookeeper_core::VERSION;
use bookeeper_server::{
    app_state, bind, build_with_state, issue_setup_code, open_db, serve, startup_setup_code, Cli,
    Command, Config, StartError,
};
use clap::Parser;

async fn run(cfg: Config) -> Result<(), StartError> {
    // Reject a bad configuration before opening a port, a directory or the database.
    cfg.validate()?;
    // Bind first: a busy port must not leave a freshly created data directory behind.
    let listener = bind(&cfg).await?;
    let db = open_db(&cfg.data_dir)?;
    // Only on stdout: the code must not reach the logs or any file.
    if let Some(code) = startup_setup_code(&db)? {
        println!("Codice di setup: {code}");
    }
    let state = app_state(db, &cfg)?;
    bookeeper_core::backup::schedule::spawn(state.clone());
    let app = build_with_state(state);
    let addr = listener.local_addr().map_err(|source| StartError::Bind {
        addr: std::net::SocketAddr::new(cfg.bind, cfg.listen_port()),
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
    let cli = Cli::parse();
    let result = match cli.command {
        Some(Command::SetupCode { data_dir }) => {
            let dir = data_dir.unwrap_or(cli.config.data_dir);
            open_db(&dir)
                .and_then(|db| issue_setup_code(&db))
                .map(|code| println!("Codice di setup: {code}"))
        }
        None => run(cli.config).await,
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
