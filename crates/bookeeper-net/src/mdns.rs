//! mDNS announcement and discovery of Bookeeper servers.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

use crate::NetError;

/// DNS-SD service type used by Bookeeper.
pub const SERVICE_TYPE: &str = "_bookeeper._tcp.local.";

const MAX_INSTANCE_BYTES: usize = 63;
const MAX_TXT_VALUE_BYTES: usize = 255;

/// What a server announces on the local network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Announcement {
    pub instance: String,
    pub port: u16,
    pub version: String,
    pub tls: String,
    pub url: Option<String>,
}

/// A server found by [`browse`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub instance: String,
    pub host: String,
    pub addrs: Vec<IpAddr>,
    pub port: u16,
    pub version: String,
    pub tls: String,
    pub url: Option<String>,
}

fn mdns_err(e: impl std::fmt::Display) -> NetError {
    NetError::Mdns(e.to_string())
}

/// Cleans an instance name: no control characters or dots, at most 63 bytes
/// (cut on a character boundary); empty becomes `Bookeeper`.
pub fn sanitize_instance(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !c.is_control() && *c != '.')
        .collect();
    let cleaned = cleaned.trim();
    let mut end = cleaned.len().min(MAX_INSTANCE_BYTES);
    while !cleaned.is_char_boundary(end) {
        end -= 1;
    }
    let out = cleaned[..end].trim_end();
    if out.is_empty() {
        "Bookeeper".to_string()
    } else {
        out.to_string()
    }
}

/// TXT records published for an announcement: only public fields.
pub fn txt_records(a: &Announcement) -> Vec<(String, String)> {
    let mut v = vec![
        ("v".to_string(), a.version.clone()),
        ("tls".to_string(), a.tls.clone()),
        ("path".to_string(), "/api/v1".to_string()),
    ];
    // mdns-sd silently truncates a TXT entry over 255 bytes, which would
    // publish a broken address: leave the entry out instead.
    if let Some(url) = a
        .url
        .as_ref()
        .filter(|u| "url=".len() + u.len() <= MAX_TXT_VALUE_BYTES)
    {
        v.push(("url".to_string(), url.clone()));
    }
    v
}

/// Builds a [`Found`] from resolved data; invalid TXT values are discarded.
pub fn found_from_txt(
    instance: &str,
    host: &str,
    addrs: Vec<IpAddr>,
    port: u16,
    txt: &[(String, String)],
) -> Found {
    let get = |key: &str| {
        txt.iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.as_str())
            .filter(|v| v.len() <= MAX_TXT_VALUE_BYTES)
            .map(str::to_string)
    };
    Found {
        instance: instance.to_string(),
        host: host.to_string(),
        addrs,
        port,
        version: get("v").unwrap_or_default(),
        tls: get("tls").unwrap_or_default(),
        url: get("url"),
    }
}

/// Keeps an announcement alive; withdraws it on drop.
pub struct Announcer {
    daemon: ServiceDaemon,
    fullname: String,
}

impl Drop for Announcer {
    fn drop(&mut self) {
        let limit = Duration::from_millis(500);
        if let Ok(rx) = self.daemon.unregister(&self.fullname) {
            let _ = rx.recv_timeout(limit);
        }
        if let Ok(rx) = self.daemon.shutdown() {
            let _ = rx.recv_timeout(limit);
        }
    }
}

fn host_label(instance: &str) -> String {
    let label: String = instance
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let label = label.trim_matches('-');
    if label.is_empty() {
        "bookeeper".to_string()
    } else {
        label.to_string()
    }
}

/// Registers the `_bookeeper._tcp.local.` service.
pub fn announce(a: &Announcement) -> Result<Announcer, NetError> {
    let instance = sanitize_instance(&a.instance);
    let host = format!("{}.local.", host_label(&instance));
    let props: Vec<(String, String)> = txt_records(a);
    let info = ServiceInfo::new(SERVICE_TYPE, &instance, &host, "", a.port, &props[..])
        .map_err(mdns_err)?
        .enable_addr_auto();
    let fullname = info.get_fullname().to_string();
    let daemon = ServiceDaemon::new().map_err(mdns_err)?;
    if let Err(e) = daemon.register(info) {
        let _ = daemon.shutdown();
        return Err(mdns_err(e));
    }
    Ok(Announcer { daemon, fullname })
}

/// Listens for `timeout` and returns the resolved services, one per instance,
/// sorted by instance name.
pub async fn browse(timeout: Duration) -> Result<Vec<Found>, NetError> {
    tokio::task::spawn_blocking(move || browse_blocking(timeout))
        .await
        .map_err(mdns_err)?
}

fn browse_blocking(timeout: Duration) -> Result<Vec<Found>, NetError> {
    let daemon = ServiceDaemon::new().map_err(mdns_err)?;
    let rx = match daemon.browse(SERVICE_TYPE) {
        Ok(rx) => rx,
        Err(e) => {
            let _ = daemon.shutdown();
            return Err(mdns_err(e));
        }
    };
    let deadline = Instant::now() + timeout;
    let mut found: BTreeMap<String, Found> = BTreeMap::new();
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        match rx.recv_timeout(left) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let fullname = info.get_fullname().to_string();
                let instance = fullname
                    .strip_suffix(&format!(".{SERVICE_TYPE}"))
                    .unwrap_or(&fullname)
                    .to_string();
                let txt: Vec<(String, String)> = info
                    .get_properties()
                    .iter()
                    .filter_map(|p| {
                        let v = std::str::from_utf8(p.val()?).ok()?;
                        Some((p.key().to_string(), v.to_string()))
                    })
                    .collect();
                let mut addrs: Vec<IpAddr> = info.get_addresses().iter().copied().collect();
                addrs.sort();
                let new =
                    found_from_txt(&instance, info.get_hostname(), addrs, info.get_port(), &txt);
                match found.get_mut(&instance) {
                    Some(old) => {
                        for ip in new.addrs.iter() {
                            if !old.addrs.contains(ip) {
                                old.addrs.push(*ip);
                            }
                        }
                        old.addrs.sort();
                    }
                    None => {
                        found.insert(instance, new);
                    }
                }
            }
            Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                let instance = fullname
                    .strip_suffix(&format!(".{SERVICE_TYPE}"))
                    .unwrap_or(&fullname);
                found.remove(instance);
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = daemon.stop_browse(SERVICE_TYPE);
    if let Ok(rx) = daemon.shutdown() {
        let _ = rx.recv_timeout(Duration::from_millis(500));
    }
    Ok(found.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ann(url: String) -> Announcement {
        Announcement {
            instance: "Bookeeper".into(),
            port: 8080,
            version: "1".into(),
            tls: "none".into(),
            url: Some(url),
        }
    }

    fn url_of(a: &Announcement) -> Option<String> {
        txt_records(a)
            .into_iter()
            .find(|(k, _)| k == "url")
            .map(|(_, v)| v)
    }

    #[test]
    fn a_long_url_is_left_out() {
        let a = ann(format!("https://example.org/{}", "a".repeat(300)));
        assert_eq!(url_of(&a), None);
    }

    #[test]
    fn a_url_at_the_limit_is_kept() {
        let url = format!("https://example.org/{}", "a".repeat(255 - 4 - 20));
        assert_eq!("url=".len() + url.len(), 255);
        assert_eq!(url_of(&ann(url.clone())), Some(url));
    }

    #[test]
    fn a_url_one_byte_over_is_left_out() {
        let url = format!("https://example.org/{}", "a".repeat(255 - 4 - 20 + 1));
        assert_eq!("url=".len() + url.len(), 256);
        assert_eq!(url_of(&ann(url)), None);
    }
}
