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
    #[arg(long, global = true, env = "BOOKEEPER_DATA", default_value = "./data")]
    pub data_dir: PathBuf,
    /// Address to listen on.
    #[arg(long, global = true, env = "BOOKEEPER_BIND", default_value = "0.0.0.0")]
    pub bind: IpAddr,
    /// Port to listen on (default: 443 with `--tls acme`, otherwise 7842).
    #[arg(long, global = true, env = "BOOKEEPER_PORT")]
    pub port: Option<u16>,
    /// TLS mode.
    #[arg(
        long,
        global = true,
        env = "BOOKEEPER_TLS",
        value_enum,
        default_value = "off"
    )]
    pub tls: TlsChoice,
    /// Public DNS names of the server, repeatable or comma separated (required
    /// with `--tls acme`; the first is the main one).
    #[arg(
        long = "domain",
        global = true,
        env = "BOOKEEPER_DOMAIN",
        value_delimiter = ','
    )]
    pub domains: Vec<String>,
    /// Contact e-mail for the ACME account.
    #[arg(long, global = true, env = "BOOKEEPER_ACME_EMAIL")]
    pub acme_email: Option<String>,
    /// ACME directory URL (default: Let's Encrypt, production).
    #[arg(long, global = true, env = "BOOKEEPER_ACME_DIRECTORY")]
    pub acme_directory: Option<String>,
    /// Address phones should use (default with `--tls acme`: `https://<domain>`).
    #[arg(long, global = true, env = "BOOKEEPER_PUBLIC_URL")]
    pub public_url: Option<String>,
    /// Announce the server on the local network (mDNS).
    #[arg(
        long,
        global = true,
        env = "BOOKEEPER_MDNS",
        value_enum,
        default_value = "on"
    )]
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
    /// Print the fingerprint and verification phrase of the self-signed
    /// certificate, then exit (no port is opened, nothing is created).
    Fingerprint {
        /// Directory holding the data (defaults to the top-level `--data-dir`).
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
    /// Exit 0 if the server on this machine answers, 1 otherwise. Reads the same
    /// flags and `BOOKEEPER_*` variables as the server; opens nothing.
    Healthcheck,
}

impl Config {
    /// All defaults, with the given data directory.
    pub fn for_data_dir(dir: impl Into<PathBuf>) -> Self {
        Config {
            data_dir: dir.into(),
            bind: IpAddr::from([0, 0, 0, 0]),
            port: None,
            tls: TlsChoice::Off,
            domains: Vec::new(),
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

    /// The domain names, normalised: trimmed, lowercase, no empty entries, no
    /// duplicates, order kept.
    pub fn domain_names(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for d in &self.domains {
            let d = d.trim().to_lowercase();
            if !d.is_empty() && !out.contains(&d) {
                out.push(d);
            }
        }
        out
    }

    /// Checks the configuration before anything is opened or created.
    pub fn validate(&self) -> Result<(), StartError> {
        let domains = self.domain_names();
        if self.tls == TlsChoice::Acme && domains.is_empty() {
            return Err(StartError::Config(
                "con --tls acme serve --domain".to_string(),
            ));
        }
        for domain in &domains {
            if !is_dns_name(domain) {
                return Err(StartError::Config(format!(
                    "--domain \"{domain}\" non è un nome DNS valido (per esempio libri.example.org)"
                )));
            }
        }
        if let Some(url) = &self.public_url {
            if !is_public_url(url) {
                return Err(StartError::Config(format!(
                    "--public-url \"{url}\" deve iniziare con http:// o https:// e indicare un indirizzo"
                )));
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
            let domain = self.domain_names().into_iter().next()?;
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

/// `http(s)://host[:port][/path]` with a DNS name, IPv4 or bracketed IPv6 host.
fn is_public_url(url: &str) -> bool {
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    if rest.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return false;
    }
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    if path.contains(['?', '#']) || authority.contains(['@', '?', '#']) {
        return false;
    }
    let (host, port) = if let Some(inner) = authority.strip_prefix('[') {
        let Some(end) = inner.find(']') else {
            return false;
        };
        let after = &inner[end + 1..];
        let port = if after.is_empty() {
            None
        } else if let Some(p) = after.strip_prefix(':') {
            Some(p)
        } else {
            return false;
        };
        if inner[..end].parse::<std::net::Ipv6Addr>().is_err() {
            return false;
        }
        return port.is_none_or(valid_port);
    } else {
        match authority.split_once(':') {
            Some((h, p)) => (h, Some(p)),
            None => (authority, None),
        }
    };
    if !(host.parse::<std::net::Ipv4Addr>().is_ok() || is_dns_name(host)) {
        return false;
    }
    port.is_none_or(valid_port)
}

fn valid_port(p: &str) -> bool {
    !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) && p.parse::<u16>().is_ok_and(|n| n >= 1)
}
