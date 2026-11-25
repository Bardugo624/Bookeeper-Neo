//! `bookeeper-server healthcheck`: is the server on this machine answering?

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::{Config, TlsChoice};

const TIMEOUT: Duration = Duration::from_secs(3);

/// Succeeds if the configured server answers: `GET /api/v1/health` with 200 over
/// plain HTTP, or just an open TCP connection with `self` and `acme`.
pub async fn check(cfg: &Config) -> Result<(), String> {
    let ip = match cfg.bind {
        IpAddr::V4(a) if a.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(a) if a.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        other => other,
    };
    let addr = SocketAddr::new(ip, cfg.listen_port());
    let plain = cfg.tls == TlsChoice::Off;
    match tokio::time::timeout(TIMEOUT, probe(addr, plain)).await {
        Ok(r) => r,
        Err(_) => Err(format!("{addr}: nessuna risposta entro 3 secondi")),
    }
}

async fn probe(addr: SocketAddr, http: bool) -> Result<(), String> {
    let mut stream = TcpStream::connect(addr)
        .await
        .map_err(|e| format!("{addr}: {e}"))?;
    if !http {
        return Ok(());
    }
    let req = format!(
        "GET /api/v1/health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nAccept: */*\r\n\r\n"
    );
    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| format!("{addr}: {e}"))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 256];
    while !buf.contains(&b'\n') && buf.len() < 1024 {
        let n = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("{addr}: {e}"))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let text = String::from_utf8_lossy(&buf);
    let line = text.lines().next().unwrap_or("").trim();
    let mut parts = line.split_whitespace();
    match (parts.next(), parts.next()) {
        (Some(v), Some("200")) if v.starts_with("HTTP/") => Ok(()),
        _ => Err(format!("{addr}: risposta inattesa \"{line}\"")),
    }
}
