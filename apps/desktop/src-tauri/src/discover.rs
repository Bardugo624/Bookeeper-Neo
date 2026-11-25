//! mDNS discovery of Bookeeper servers on the local network.

use serde::Serialize;
use std::time::Duration;

/// A server found on the network, in the shape the webview receives.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Found {
    pub instance: String,
    pub host: String,
    pub addrs: Vec<String>,
    pub port: u16,
    pub version: String,
    pub tls: String,
    pub url: Option<String>,
}

impl From<bookeeper_net::mdns::Found> for Found {
    fn from(f: bookeeper_net::mdns::Found) -> Self {
        Found {
            instance: f.instance,
            host: f.host,
            addrs: f.addrs.iter().map(ToString::to_string).collect(),
            port: f.port,
            version: f.version,
            tls: f.tls,
            url: f.url,
        }
    }
}

/// Browses for two seconds; an mDNS failure yields an empty list.
pub async fn discover() -> Vec<Found> {
    match bookeeper_net::mdns::browse(Duration::from_secs(2)).await {
        Ok(found) => found.into_iter().map(Found::from).collect(),
        Err(e) => {
            tracing::warn!("mDNS discovery failed: {e}");
            Vec::new()
        }
    }
}
