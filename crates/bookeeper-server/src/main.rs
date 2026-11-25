use bookeeper_core::VERSION;
use bookeeper_server::{
    announce, app_state, bind, build_with_state, identity_lines, issue_setup_code,
    load_self_identity, open_db, self_dir, serve, startup_setup_code, Cli, Command, Config,
    StartError, TlsChoice, TlsServer,
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
    let port = addr.port();
    let scheme = if cfg.tls == TlsChoice::Off {
        "http"
    } else {
        "https"
    };
    let listening = format!("Bookeeper {VERSION} in ascolto su {scheme}://{addr}");
    let result = match cfg.tls {
        TlsChoice::Off => {
            println!("{listening}");
            let _announcer = announce::start(&cfg, port);
            serve(listener, app).await
        }
        TlsChoice::SelfSigned => {
            let identity = load_self_identity(&cfg)?;
            let server = TlsServer::self_signed(listener, &identity)?;
            println!("{listening}");
            for line in identity_lines(&identity) {
                println!("{line}");
            }
            let _announcer = announce::start(&cfg, port);
            server.serve(app).await
        }
        TlsChoice::Acme => {
            let server = TlsServer::acme(listener, &cfg)?;
            println!("{listening}");
            let domains = cfg.domain_names();
            if !domains.is_empty() {
                println!(
                    "Certificato richiesto per {}: la porta 443 deve essere raggiungibile da Internet.",
                    domains.join(", ")
                );
            }
            let _announcer = announce::start(&cfg, port);
            server.serve(app).await
        }
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stdout()))
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let cli = Cli::parse();
    if let Some(Command::Healthcheck) = &cli.command {
        // Silent on success; one line on stderr and exit 1 otherwise.
        if let Err(e) = bookeeper_server::health::check(&cli.config).await {
            eprintln!("healthcheck: {e}");
            std::process::exit(1);
        }
        return;
    }
    let result = match cli.command {
        Some(Command::SetupCode { data_dir }) => {
            let dir = data_dir.unwrap_or(cli.config.data_dir);
            open_db(&dir)
                .and_then(|db| issue_setup_code(&db))
                .map(|code| println!("Codice di setup: {code}"))
        }
        Some(Command::Fingerprint { data_dir }) => {
            let dir = data_dir.unwrap_or(cli.config.data_dir);
            match bookeeper_net::tls::Identity::load(&self_dir(&dir)) {
                Ok(Some(identity)) => {
                    for line in identity_lines(&identity) {
                        println!("{line}");
                    }
                    Ok(())
                }
                Ok(None) => Err(StartError::Tls(
                    "nessun certificato autogenerato in questa cartella: avvia il server una volta con --tls self"
                        .to_string(),
                )),
                Err(e) => Err(StartError::Tls(format!("TLS: {e}"))),
            }
        }
        Some(Command::Healthcheck) => unreachable!("handled above"),
        None => run(cli.config).await,
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
