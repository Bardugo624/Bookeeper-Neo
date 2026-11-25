//! HTTPS serving: self-signed identity (`self`) and automatic certificates (`acme`).

use std::io;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use axum_server::Handle;
use bookeeper_net::tls::Identity;
use futures_util::StreamExt;
use rustls_acme::caches::DirCache;
use rustls_acme::{AcmeConfig, UseChallenge};
use tokio::net::TcpListener;

use crate::{shutdown_signal, Config, StartError};

/// Longest wait for open connections after a shutdown request.
const GRACE: Duration = Duration::from_secs(10);

/// Longest time a client may take to complete the TLS handshake in `acme` mode.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Wraps an acceptor so that its handshake must finish within [`HANDSHAKE_TIMEOUT`].
#[derive(Clone)]
struct TimeoutAcceptor<A>(A);

impl<A, I, S> axum_server::accept::Accept<I, S> for TimeoutAcceptor<A>
where
    A: axum_server::accept::Accept<I, S>,
    A::Future: Send + 'static,
    A::Stream: 'static,
    A::Service: 'static,
{
    type Stream = A::Stream;
    type Service = A::Service;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = io::Result<(A::Stream, A::Service)>> + Send>,
    >;

    fn accept(&self, stream: I, service: S) -> Self::Future {
        let fut = self.0.accept(stream, service);
        Box::pin(async move {
            match tokio::time::timeout(HANDSHAKE_TIMEOUT, fut).await {
                Ok(res) => res,
                Err(_) => Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "TLS handshake timed out",
                )),
            }
        })
    }
}

/// Directory of the self-signed identity.
pub fn self_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("tls").join("self")
}

fn tls_error(e: impl std::fmt::Display) -> StartError {
    StartError::Tls(format!("TLS: {e}"))
}

/// Names the self-signed certificate must be valid for.
pub fn self_names(cfg: &Config) -> Vec<String> {
    let mut names = vec!["localhost".to_string()];
    if let Ok(host) = gethostname::gethostname().into_string() {
        if !host.is_empty() {
            names.push(host);
        }
    }
    names.extend(cfg.domain_names());
    if !is_unspecified(cfg.bind) {
        names.push(cfg.bind.to_string());
    }
    let mut seen = std::collections::HashSet::new();
    names.retain(|n| seen.insert(n.clone()));
    names
}

fn is_unspecified(ip: IpAddr) -> bool {
    ip.is_unspecified()
}

/// Loads (or creates) the self-signed identity of the data directory.
pub fn load_self_identity(cfg: &Config) -> Result<Identity, StartError> {
    bookeeper_net::install_crypto_provider();
    Identity::load_or_create(&self_dir(&cfg.data_dir), &self_names(cfg)).map_err(tls_error)
}

/// A TLS server that has an open socket but is not yet serving.
pub struct TlsServer {
    listener: TcpListener,
    kind: Kind,
}

enum Kind {
    SelfSigned(Arc<rustls::ServerConfig>),
    Acme(rustls_acme::axum::AxumAcceptor),
}

impl TlsServer {
    /// Self-signed mode on an already bound socket.
    pub fn self_signed(listener: TcpListener, identity: &Identity) -> Result<Self, StartError> {
        bookeeper_net::install_crypto_provider();
        Ok(TlsServer {
            listener,
            kind: Kind::SelfSigned(identity.server_config().map_err(tls_error)?),
        })
    }

    /// ACME mode (TLS-ALPN-01) on an already bound socket. Spawns the background
    /// task that obtains and renews the certificate; must run inside a Tokio runtime.
    pub fn acme(listener: TcpListener, cfg: &Config) -> Result<Self, StartError> {
        bookeeper_net::install_crypto_provider();
        let domains = cfg.domain_names();
        if domains.is_empty() {
            return Err(StartError::Config(
                "con --tls acme serve --domain".to_string(),
            ));
        }
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut acme = AcmeConfig::new_with_provider(domains, provider.clone())
            .cache(DirCache::new(cfg.data_dir.join("tls").join("acme")))
            .challenge_type(UseChallenge::TlsAlpn01);
        if let Some(email) = &cfg.acme_email {
            acme = acme.contact_push(format!("mailto:{email}"));
        }
        acme = match &cfg.acme_directory {
            Some(url) => acme.directory(url),
            None => acme.directory_lets_encrypt(true),
        };
        let mut state = acme.state();
        let mut config = rustls::ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(tls_error)?
            .with_no_client_auth()
            .with_cert_resolver(state.resolver());
        config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        let acceptor = state.axum_acceptor(Arc::new(config));
        tokio::spawn(async move {
            // The event loop never ends the process: failures are logged and retried
            // by the ACME state machine itself.
            while let Some(event) = state.next().await {
                match event {
                    Ok(ok) => tracing::info!("ACME: {ok:?}"),
                    Err(err) => tracing::warn!("ACME: {err}"),
                }
            }
        });
        Ok(TlsServer {
            listener,
            kind: Kind::Acme(acceptor),
        })
    }

    /// Serves `app` until Ctrl+C or SIGTERM, then closes within ten seconds.
    pub async fn serve(self, app: axum::Router) -> io::Result<()> {
        self.serve_until(app, shutdown_signal()).await
    }

    /// Like [`serve`](Self::serve) but stops when `stop` resolves instead of on signals.
    pub async fn serve_until(
        self,
        app: axum::Router,
        stop: impl std::future::Future<Output = ()> + Send + 'static,
    ) -> io::Result<()> {
        let std_listener = self.listener.into_std()?;
        let handle = Handle::new();
        let h = handle.clone();
        tokio::spawn(async move {
            stop.await;
            h.graceful_shutdown(Some(GRACE));
        });
        let server = axum_server::from_tcp(std_listener)?.handle(handle);
        let make = app.into_make_service();
        match self.kind {
            Kind::SelfSigned(config) => {
                server
                    .acceptor(axum_server::tls_rustls::RustlsAcceptor::new(
                        axum_server::tls_rustls::RustlsConfig::from_config(config),
                    ))
                    .serve(make)
                    .await
            }
            Kind::Acme(acceptor) => server.acceptor(TimeoutAcceptor(acceptor)).serve(make).await,
        }
    }
}
