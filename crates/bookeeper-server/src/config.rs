//! Server configuration: flags, environment variables, defaults and validation.

use std::net::IpAddr;
use std::path::PathBuf;

use bookeeper_core::{ServerInfo, TlsMode, VERSION};
use clap::{Parser, Subcommand, ValueEnum};

use crate::StartError;

/// How the server terminates TLS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum TlsChoice {
    /// Plain HTTP.
    Off,
    /// Self-signed certificate kept in the data directory.
    #[value(name = "self")]
    SelfSigned,
    /// Certificate obtained through ACME (Let's Encrypt).
    Acme,
}

/// A plain on/off flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum Switch {
    On,
    Off,
}

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
    /// Port to listen on (default: 443 with `--tls acme`, otherwise 7842).
    #[arg(long, env = "BOOKEEPER_PORT")]
    pub port: Option<u16>,
    /// TLS mode.
    #[arg(long, env = "BOOKEEPER_TLS", value_enum, default_value = "off")]
    pub tls: TlsChoice,
    /// Public DNS name of the server (required with `--tls acme`).
    #[arg(long, env = "BOOKEEPER_DOMAIN")]
    pub domain: Option<String>,
    /// Contact e-mail for the ACME account.
    #[arg(long, env = "BOOKEEPER_ACME_EMAIL")]
    pub acme_email: Option<String>,
    /// ACME directory URL (default: Let's Encrypt, production).
    #[arg(long, env = "BOOKEEPER_ACME_DIRECTORY")]
    pub acme_directory: Option<String>,
    /// Address phones should use (default with `--tls acme`: `https://<domain>`).
    #[arg(long, env = "BOOKEEPER_PUBLIC_URL")]
    pub public_url: Option<String>,
    /// Announce the server on the local network (mDNS).
    #[arg(long, env = "BOOKEEPER_MDNS", value_enum, default_value = "on")]
    pub mdns: Switch,
}

/// Command line: the startup flags plus an optional subcommand.
#[derive(Debug, Clone, Parser)]
#[command(name = "bookeeper-server", version = VERSION)]
pub struct Cli {
    #[command(flatten)]
    pub config: Config,
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Clone, Subcommand)]
pub enum Command {
    /// Generate and print a new setup code, then exit (no port is opened).
    SetupCode {
        /// Directory holding the database (defaults to the top-level `--data-dir`).
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
}

impl Config {
    /// All defaults, with the given data directory.
    pub fn for_data_dir(dir: impl Into<PathBuf>) -> Self {
        Config {
            data_dir: dir.into(),
            bind: IpAddr::from([0, 0, 0, 0]),
            port: None,
            tls: TlsChoice::Off,
            domain: None,
            acme_email: None,
            acme_directory: None,
            public_url: None,
            mdns: Switch::On,
        }
    }

    /// The explicit port, or 443 with ACME and 7842 otherwise.
    pub fn listen_port(&self) -> u16 {
        self.port.unwrap_or(match self.tls {
            TlsChoice::Acme => 443,
            _ => 7842,
        })
    }

    /// Checks the configuration before anything is opened or created.
    pub fn validate(&self) -> Result<(), StartError> {
        if self.tls == TlsChoice::Acme && self.domain.is_none() {
            return Err(StartError::Config(
                "con --tls acme serve --domain".to_string(),
            ));
        }
        if let Some(domain) = &self.domain {
            if !is_dns_name(domain) {
                return Err(StartError::Config(format!(
                    "--domain \"{domain}\" non è un nome DNS valido (per esempio libri.example.org)"
                )));
            }
        }
        if let Some(url) = &self.public_url {
            let rest = url
                .strip_prefix("https://")
                .or_else(|| url.strip_prefix("http://"));
            match rest {
                Some(r) if !r.trim_matches('/').is_empty() => {}
                _ => {
                    return Err(StartError::Config(format!(
                        "--public-url \"{url}\" deve iniziare con http:// o https:// e indicare un indirizzo"
                    )))
                }
            }
        }
        Ok(())
    }

    /// The address phones should use, without a trailing slash.
    pub fn public_url(&self) -> Option<String> {
        if let Some(url) = &self.public_url {
            return Some(url.trim_end_matches('/').to_string());
        }
        if self.tls == TlsChoice::Acme {
            let domain = self.domain.as_ref()?;
            let port = self.listen_port();
            return Some(if port == 443 {
                format!("https://{domain}")
            } else {
                format!("https://{domain}:{port}")
            });
        }
        None
    }

    /// What the running server tells clients about itself.
    pub fn server_info(&self) -> ServerInfo {
        ServerInfo {
            tls: match self.tls {
                TlsChoice::Off => TlsMode::Off,
                TlsChoice::SelfSigned => TlsMode::SelfSigned,
                TlsChoice::Acme => TlsMode::Acme,
            },
            public_url: self.public_url(),
        }
    }
}

fn is_dns_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 253
        && s.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
                && !label.starts_with('-')
                && !label.ends_with('-')
        })
}
