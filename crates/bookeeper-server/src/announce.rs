//! Announces the running server on the local network (mDNS), so clients can list it.

use bookeeper_net::mdns::{announce, Announcement};

pub use bookeeper_net::mdns::Announcer;

use crate::{Config, Switch, TlsChoice};

/// The instance name for host `host`, exactly as published on the network.
pub fn instance_for(host: &str) -> String {
    let name = if host.is_empty() {
        "Bookeeper".to_string()
    } else {
        format!("Bookeeper su {host}")
    };
    bookeeper_net::mdns::sanitize_instance(&name)
}

/// What to announce for `cfg`, listening on the port actually bound (`port`).
pub fn announcement(cfg: &Config, port: u16) -> Announcement {
    let host = gethostname::gethostname()
        .to_string_lossy()
        .trim()
        .to_string();
    let instance = instance_for(&host);
    let tls = match cfg.tls {
        TlsChoice::Off => "off",
        TlsChoice::SelfSigned => "self",
        TlsChoice::Acme => "acme",
    };
    Announcement {
        instance,
        port,
        version: bookeeper_core::VERSION.to_string(),
        tls: tls.to_string(),
        url: cfg.public_url(),
    }
}

/// Starts the announcement. `None` when mDNS is off, when the server listens on a
/// loopback address (not reachable from the network) or when announcing fails: a
/// failure is logged and never stops the server.
pub fn start(cfg: &Config, port: u16) -> Option<Announcer> {
    if cfg.mdns == Switch::Off || cfg.bind.is_loopback() {
        return None;
    }
    let a = announcement(cfg, port);
    match announce(&a) {
        Ok(announcer) => {
            println!("Annunciato in rete locale come \"{}\".", a.instance);
            Some(announcer)
        }
        Err(e) => {
            tracing::warn!("mDNS announcement failed: {e}");
            None
        }
    }
}
