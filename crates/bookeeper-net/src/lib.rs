//! Networking helpers shared by the server: TLS identity, verification phrase, mDNS.

pub mod mdns;
pub mod phrase;
pub mod tls;

/// Errors raised by the networking helpers.
#[derive(Debug, thiserror::Error)]
pub enum NetError {
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("tls error: {0}")]
    Tls(String),
    #[error("mdns error: {0}")]
    Mdns(String),
}

/// Installs `ring` as the process-wide rustls crypto provider.
///
/// Safe to call more than once; if a provider is already installed it is kept.
pub fn install_crypto_provider() {
    // Err means another provider is already installed, which is fine.
    let _ = rustls::crypto::ring::default_provider().install_default();
}
