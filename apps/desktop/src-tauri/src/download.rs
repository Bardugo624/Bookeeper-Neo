//! Downloading a file from the library straight to disk, without holding it in memory.
//!
//! The answer is opened first, so a refusal (404, 403, a dead server) is reported before
//! any "Save as" window; the bytes then go to a temporary file in the chosen folder chunk by
//! chunk, and the file takes its name only when everything has arrived.

use std::collections::BTreeMap;
use std::path::Path;

use axum::body::{Body, Bytes};
use axum::http::Request;
use http_body_util::BodyExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;

use crate::connections::Store;
use crate::dispatch::{check_request, filter_request_headers};
use crate::remote::{self, Target};

/// What the webview gets back. `status` is set only for an answer that was not 2xx.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DownloadOutcome {
    pub saved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    /// Another download holds the lock: nothing was started. Distinct from a cancelled window.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub busy: bool,
}

impl DownloadOutcome {
    pub fn cancelled() -> Self {
        Self {
            saved: false,
            path: None,
            status: None,
            busy: false,
        }
    }
    pub fn busy() -> Self {
        Self {
            busy: true,
            ..Self::cancelled()
        }
    }
    pub fn refused(status: u16) -> Self {
        Self {
            saved: false,
            path: None,
            status: Some(status),
            busy: false,
        }
    }
}

/// The body of an answer, read one chunk at a time.
pub enum Source {
    Remote(reqwest::Response),
    Local(Body),
}

impl Source {
    pub async fn chunk(&mut self) -> Result<Option<Bytes>, String> {
        match self {
            Source::Remote(r) => r.chunk().await.map_err(|e| e.to_string()),
            Source::Local(body) => loop {
                match body.frame().await {
                    None => return Ok(None),
                    Some(Err(e)) => return Err(e.to_string()),
                    Some(Ok(frame)) => {
                        if let Ok(data) = frame.into_data() {
                            return Ok(Some(data));
                        }
                    }
                }
            },
        }
    }
}

/// An answer whose headers have arrived and whose body has not been read.
pub struct Opened {
    pub status: u16,
    pub disposition: Option<String>,
    pub source: Source,
}

/// Opens `path` (an `/api/` address) on the chosen connection: the in-process core, or a
/// remote server with the headers the webview sent (the session's `Authorization`).
pub async fn open(
    store: &Store,
    router: axum::Router,
    connection_id: Option<&str>,
    path: &str,
    headers: &BTreeMap<String, String>,
) -> Result<Opened, String> {
    match remote::resolve(store, connection_id) {
        Target::Remote { url, fingerprint } => {
            open_remote(&url, fingerprint.as_deref(), path, headers).await
        }
        Target::Core => open_core(router, path, headers).await,
        Target::Invalid(m) => Err(m.to_owned()),
    }
}

pub async fn open_remote(
    url: &str,
    fingerprint: Option<&str>,
    path: &str,
    headers: &BTreeMap<String, String>,
) -> Result<Opened, String> {
    let resp = remote::open_download(url, fingerprint, path, headers)
        .await
        .map_err(str::to_owned)?;
    Ok(Opened {
        status: resp.status().as_u16(),
        disposition: resp
            .headers()
            .get("content-disposition")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned),
        source: Source::Remote(resp),
    })
}

pub async fn open_core(
    router: axum::Router,
    path: &str,
    headers: &BTreeMap<String, String>,
) -> Result<Opened, String> {
    let method = check_request("GET", path).map_err(str::to_owned)?;
    let mut builder = Request::builder().method(method).uri(path);
    for (name, value) in filter_request_headers(headers, false) {
        builder = builder.header(name, value);
    }
    let request = builder
        .body(Body::empty())
        .map_err(|_| "Invalid request".to_owned())?;
    let response = match router.oneshot(request).await {
        Ok(r) => r,
        Err(never) => match never {},
    };
    let status = response.status().as_u16();
    let disposition = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    Ok(Opened {
        status,
        disposition,
        source: Source::Local(response.into_body()),
    })
}

/// The file name a `Content-Disposition` header proposes: `filename*` (UTF-8) first, then
/// `filename`. `None` when there is none; the caller sanitizes it.
pub fn disposition_name(header: &str) -> Option<String> {
    let mut plain = None;
    for part in header.split(';').skip(1) {
        let part = part.trim();
        let lower = part.to_ascii_lowercase();
        if lower.starts_with("filename*") {
            let value = part.split_once('=')?.1.trim();
            // `UTF-8''Autore%20-%20Titolo.epub`
            let encoded = value.splitn(3, '\'').nth(2).unwrap_or(value);
            if let Some(name) = percent_decode(encoded) {
                return Some(name);
            }
        } else if lower.starts_with("filename") {
            if let Some((_, v)) = part.split_once('=') {
                let v = v.trim().trim_matches('"');
                if !v.is_empty() {
                    plain = Some(v.to_owned());
                }
            }
        }
    }
    plain
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok().filter(|n| !n.is_empty())
}

/// Writes the rest of `source` to `dest`: temporary file next to it, then rename. A failure
/// at any point leaves no temporary file and does not touch an existing `dest`.
pub async fn write_stream(source: &mut Source, dest: &Path) -> Result<u64, String> {
    let dir = dest
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let tmp = dir.join(format!(".bookeeper-{}.tmp", uuid::Uuid::now_v7()));
    let result = copy_to(source, &tmp).await;
    match result {
        Ok(total) => {
            if tokio::fs::rename(&tmp, dest).await.is_err() {
                // Some folders refuse a rename over an open or special target; copy instead.
                let copied = tokio::fs::copy(&tmp, dest).await;
                let _ = tokio::fs::remove_file(&tmp).await;
                copied.map_err(|e| format!("cannot write {}: {e}", dest.display()))?;
            }
            Ok(total)
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            Err(e)
        }
    }
}

async fn copy_to(source: &mut Source, tmp: &Path) -> Result<u64, String> {
    let mut file = tokio::fs::File::create(tmp)
        .await
        .map_err(|e| format!("cannot write {}: {e}", tmp.display()))?;
    let mut total = 0u64;
    while let Some(chunk) = source.chunk().await? {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("cannot write {}: {e}", tmp.display()))?;
        total += chunk.len() as u64;
    }
    file.flush().await.map_err(|e| e.to_string())?;
    file.sync_all().await.map_err(|e| e.to_string())?;
    Ok(total)
}
