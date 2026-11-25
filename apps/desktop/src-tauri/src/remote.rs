//! Remote transport (design §6.4): talks to a Bookeeper server over HTTP(S),
//! pinning the certificate fingerprint when the connection has one.

use crate::connections::{ConnectionKind, Store};
use crate::dispatch::{
    self, bad_request, check_request, error, exposed_headers, filter_request_headers,
    raw_bad_request, raw_error, ApiResponse, RawApiResponse,
};
use axum::http::{HeaderMap, StatusCode};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::{redirect::Policy, Client, Url};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    crypto::{ring, WebPkiSupportedAlgorithms},
    pki_types::{CertificateDer, ServerName, UnixTime},
    DigitallySignedStruct, SignatureScheme,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::net::{IpAddr, Ipv6Addr};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(60);

/// True for loopback, private and link-local addresses and `.local` names.
/// Never resolves a name.
pub fn is_local_address(host: &str) -> bool {
    let host = host.trim();
    let host = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
            IpAddr::V6(v6) => is_local_v6(&v6),
        };
    }
    let name = host.trim_end_matches('.').to_ascii_lowercase();
    name == "localhost"
        || name
            .strip_suffix(".local")
            .is_some_and(|label| !label.is_empty())
}

fn is_local_v6(v6: &Ipv6Addr) -> bool {
    if let Some(v4) = v6.to_ipv4_mapped() {
        return v4.is_loopback() || v4.is_private() || v4.is_link_local();
    }
    let first = v6.segments()[0];
    v6.is_loopback() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
}

/// Parses `AA:BB:..` or plain hex into a SHA-256 fingerprint.
fn parse_fingerprint(s: &str) -> Option<[u8; 32]> {
    let clean: String = s
        .chars()
        .filter(|c| *c != ':' && !c.is_whitespace())
        .collect();
    hex::decode(clean).ok()?.try_into().ok()
}

struct Failure {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
}

impl Failure {
    fn bad(message: &'static str) -> Self {
        Failure {
            status: StatusCode::BAD_REQUEST,
            code: "bad_request",
            message,
        }
    }
    fn insecure() -> Self {
        Failure {
            status: StatusCode::BAD_REQUEST,
            code: "insecure_address",
            message: "Plain http is only allowed to local addresses",
        }
    }
    fn network() -> Self {
        Failure {
            status: StatusCode::OK,
            code: "network",
            message: "Cannot reach the server",
        }
    }
    fn json(self) -> ApiResponse {
        let mut r = error(self.status, self.code, self.message);
        if self.code == "network" {
            r.status = 0;
        }
        r
    }
    fn raw(self) -> RawApiResponse {
        let mut r = raw_error(self.status, self.code, self.message);
        if self.code == "network" {
            r.status = 0;
        }
        r
    }
}

type ClientKey = (String, Option<[u8; 32]>);

fn clients() -> &'static Mutex<HashMap<ClientKey, Client>> {
    static CLIENTS: std::sync::OnceLock<Mutex<HashMap<ClientKey, Client>>> =
        std::sync::OnceLock::new();
    CLIENTS.get_or_init(Default::default)
}

fn base_builder() -> reqwest::ClientBuilder {
    bookeeper_net::install_crypto_provider();
    Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(RESPONSE_TIMEOUT)
        .redirect(Policy::none())
        // Servers are on the user's own network or pinned: never via a system proxy.
        .no_proxy()
}

/// The client for `(url, fingerprint)`, built once.
fn client_for(origin: &str, fingerprint: Option<[u8; 32]>) -> Result<Client, Failure> {
    let key = (origin.to_owned(), fingerprint);
    let mut map = clients().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(c) = map.get(&key) {
        return Ok(c.clone());
    }
    let mut builder = base_builder();
    if let Some(fp) = fingerprint {
        builder = builder.use_preconfigured_tls(
            bookeeper_net::tls::pinned_client_config(fp)
                .as_ref()
                .clone(),
        );
    }
    let client = builder.build().map_err(|_| Failure::network())?;
    map.insert(key, client.clone());
    Ok(client)
}

/// Scheme://host[:port] of a validated http(s) URL, with no path.
fn origin_of(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    let mut s = format!("{}://{}", url.scheme(), host);
    if let Some(p) = url.port() {
        s.push_str(&format!(":{p}"));
    }
    Some(s)
}

fn parse_base(url: &str) -> Result<Url, Failure> {
    let u = Url::parse(url).map_err(|_| Failure::bad("Invalid server address"))?;
    if !matches!(u.scheme(), "http" | "https") || u.host_str().is_none() {
        return Err(Failure::bad("Invalid server address"));
    }
    if u.scheme() == "http" && !u.host_str().is_some_and(is_local_address) {
        return Err(Failure::insecure());
    }
    Ok(u)
}

struct Wire {
    status: u16,
    headers: HeaderMap,
    body: Vec<u8>,
}

#[allow(clippy::too_many_arguments)]
async fn send(
    url: &str,
    fingerprint: Option<&str>,
    method: &str,
    path: &str,
    body: Option<Vec<u8>>,
    content_type: Option<&str>,
    headers: &BTreeMap<String, String>,
) -> Result<Wire, Failure> {
    let method = check_request(method, path).map_err(Failure::bad)?;
    let base = parse_base(url)?;
    let origin = origin_of(&base).ok_or_else(|| Failure::bad("Invalid server address"))?;
    let fp = match fingerprint.filter(|f| !f.is_empty()) {
        Some(f) => Some(parse_fingerprint(f).ok_or_else(|| Failure::bad("Invalid fingerprint"))?),
        None => None,
    };
    if path.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(Failure::bad("Invalid request"));
    }
    // Dot segments or odd characters must not leave `/api/`.
    let target =
        Url::parse(&format!("{origin}{path}")).map_err(|_| Failure::bad("Invalid request"))?;
    if !target.path().starts_with("/api/") || origin_of(&target).as_deref() != Some(&origin) {
        return Err(Failure::bad("Path must start with /api/"));
    }
    let client = client_for(&origin, fp)?;
    let mut req = client.request(method, target);
    if body.is_some() {
        if let Some(ct) = content_type.filter(|c| !c.is_empty()) {
            req = req.header("content-type", ct);
        }
    }
    for (name, value) in filter_request_headers(headers, true) {
        req = req.header(name, value);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|_| Failure::network())?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let body = resp.bytes().await.map_err(|_| Failure::network())?.to_vec();
    Ok(Wire {
        status,
        headers,
        body,
    })
}

/// JSON request to a remote server; same result type as the in-process dispatch.
pub async fn request(
    url: &str,
    fingerprint: Option<&str>,
    method: &str,
    path: &str,
    body: Option<String>,
    headers: BTreeMap<String, String>,
) -> ApiResponse {
    let ct = body.is_some().then_some("application/json");
    match send(
        url,
        fingerprint,
        method,
        path,
        body.map(String::into_bytes),
        ct,
        &headers,
    )
    .await
    {
        Ok(w) => ApiResponse {
            status: w.status,
            body: String::from_utf8_lossy(&w.body).into_owned(),
        },
        Err(f) => f.json(),
    }
}

/// Binary request to a remote server; same result type as `dispatch_raw`.
pub async fn request_raw(
    url: &str,
    fingerprint: Option<&str>,
    method: &str,
    path: &str,
    body_base64: Option<String>,
    content_type: Option<String>,
    headers: BTreeMap<String, String>,
) -> RawApiResponse {
    let body = match body_base64 {
        Some(b) => match STANDARD.decode(b) {
            Ok(bytes) => Some(bytes),
            Err(_) => return raw_bad_request("Invalid base64 body"),
        },
        None => None,
    };
    match send(
        url,
        fingerprint,
        method,
        path,
        body,
        content_type.as_deref(),
        &headers,
    )
    .await
    {
        Ok(w) => RawApiResponse {
            status: w.status,
            body_base64: STANDARD.encode(&w.body),
            content_type: w
                .headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned),
            headers: exposed_headers(&w.headers),
        },
        Err(f) => f.raw(),
    }
}

/// Where a request goes.
enum Target {
    Core,
    Remote {
        url: String,
        fingerprint: Option<String>,
    },
    Invalid(&'static str),
}

fn resolve(store: &Store, connection_id: Option<&str>) -> Target {
    let conns = match store.load() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("cannot read connections: {e}");
            return match connection_id {
                Some(_) => Target::Invalid("Unknown connection"),
                None => Target::Core,
            };
        }
    };
    let id = connection_id.or(conns.active.as_deref());
    let Some(id) = id else { return Target::Core };
    let Some(c) = conns.items.iter().find(|c| c.id == id) else {
        return match connection_id {
            Some(_) => Target::Invalid("Unknown connection"),
            // A dangling active id behaves as no active connection.
            None => Target::Core,
        };
    };
    match c.kind {
        ConnectionKind::Local => Target::Core,
        ConnectionKind::Remote => match &c.url {
            Some(url) => Target::Remote {
                url: url.clone(),
                fingerprint: c.fingerprint.clone(),
            },
            None => Target::Invalid("Connection has no address"),
        },
    }
}

/// Routes a JSON request to the core or to the chosen remote connection.
pub async fn route(
    store: &Store,
    router: axum::Router,
    connection_id: Option<&str>,
    method: &str,
    path: &str,
    body: Option<String>,
    headers: BTreeMap<String, String>,
) -> ApiResponse {
    match resolve(store, connection_id) {
        Target::Core => dispatch::dispatch(router, method, path, body, headers).await,
        Target::Remote { url, fingerprint } => {
            request(&url, fingerprint.as_deref(), method, path, body, headers).await
        }
        Target::Invalid(m) => bad_request(m),
    }
}

/// Routes a binary request to the core or to the chosen remote connection.
#[allow(clippy::too_many_arguments)]
pub async fn route_raw(
    store: &Store,
    router: axum::Router,
    connection_id: Option<&str>,
    method: &str,
    path: &str,
    body_base64: Option<String>,
    content_type: Option<String>,
    headers: BTreeMap<String, String>,
) -> RawApiResponse {
    match resolve(store, connection_id) {
        Target::Core => {
            dispatch::dispatch_raw(router, method, path, body_base64, content_type, headers).await
        }
        Target::Remote { url, fingerprint } => {
            request_raw(
                &url,
                fingerprint.as_deref(),
                method,
                path,
                body_base64,
                content_type,
                headers,
            )
            .await
        }
        Target::Invalid(m) => raw_bad_request(m),
    }
}

// ---- probe ----

#[derive(Debug, Clone, Default, Serialize)]
pub struct ProbeOut {
    pub reachable: bool,
    pub trusted: bool,
    pub fingerprint: Option<String>,
    pub phrase: Option<String>,
    pub server: Option<serde_json::Value>,
    pub setup: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl ProbeOut {
    fn failed(code: &str) -> Self {
        ProbeOut {
            error: Some(code.to_owned()),
            ..Default::default()
        }
    }
}

/// Adds `https://` when no scheme is given and drops trailing slashes.
fn normalize(url: &str) -> String {
    let u = url.trim();
    let u = if u.contains("://") {
        u.to_owned()
    } else {
        format!("https://{u}")
    };
    u.trim_end_matches('/').to_owned()
}

/// Accepts any certificate but remembers the one it saw. Used only to read the
/// fingerprint of an untrusted server; no credential is ever sent through it.
#[derive(Debug)]
struct Recorder {
    seen: Mutex<Option<[u8; 32]>>,
    algs: WebPkiSupportedAlgorithms,
}

impl ServerCertVerifier for Recorder {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let digest: [u8; 32] = Sha256::digest(end_entity.as_ref()).into();
        *self.seen.lock().unwrap_or_else(|e| e.into_inner()) = Some(digest);
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        m: &[u8],
        c: &CertificateDer<'_>,
        d: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(m, c, d, &self.algs)
    }
    fn verify_tls13_signature(
        &self,
        m: &[u8],
        c: &CertificateDer<'_>,
        d: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(m, c, d, &self.algs)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algs.supported_schemes()
    }
}

async fn get_json(
    client: &Client,
    base: &str,
    path: &str,
) -> Result<Option<serde_json::Value>, ()> {
    let resp = client
        .get(format!("{base}{path}"))
        .send()
        .await
        .map_err(|_| ())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let bytes = resp.bytes().await.map_err(|_| ())?;
    Ok(serde_json::from_slice(&bytes).ok())
}

fn looks_like_server(v: &serde_json::Value) -> bool {
    v.get("version").is_some_and(|x| x.is_string()) && v.get("tls").is_some_and(|x| x.is_string())
}

fn looks_like_setup(v: &serde_json::Value) -> bool {
    v.get("needs_setup").is_some_and(|x| x.is_boolean())
}

/// Reads `/api/v1/server` and `/api/v1/setup` with a client that sends no headers.
async fn read_info(client: &Client, base: &str, mut out: ProbeOut) -> ProbeOut {
    match get_json(client, base, "/api/v1/server").await {
        Err(()) => {
            return ProbeOut {
                reachable: false,
                ..out
            }
        }
        Ok(Some(v)) if looks_like_server(&v) => out.server = Some(v),
        Ok(_) => {
            out.reachable = true;
            out.error = Some("not_bookeeper".into());
            return out;
        }
    }
    out.reachable = true;
    out.setup = get_json(client, base, "/api/v1/setup")
        .await
        .ok()
        .flatten()
        .filter(looks_like_setup);
    out
}

/// Looks at an address before the user trusts it (design §6.4).
pub async fn probe(url: &str) -> ProbeOut {
    let normalized = normalize(url);
    let Ok(parsed) = Url::parse(&normalized) else {
        return ProbeOut::failed("network");
    };
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return ProbeOut::failed("network");
    }
    let Some(base) = origin_of(&parsed) else {
        return ProbeOut::failed("network");
    };
    if parsed.scheme() == "http" {
        if !parsed.host_str().is_some_and(is_local_address) {
            return ProbeOut::failed("insecure_address");
        }
        let Ok(client) = base_builder().build() else {
            return ProbeOut::failed("network");
        };
        let out = ProbeOut {
            trusted: true,
            ..Default::default()
        };
        let mut out = read_info(&client, &base, out).await;
        if !out.reachable {
            out = ProbeOut::failed("network");
        }
        return out;
    }
    // https: WebPKI roots first.
    if let Ok(client) = base_builder().build() {
        let out = read_info(
            &client,
            &base,
            ProbeOut {
                trusted: true,
                ..Default::default()
            },
        )
        .await;
        if out.reachable {
            return out;
        }
    }
    // Untrusted: read the certificate fingerprint and the public info only.
    let provider = Arc::new(ring::default_provider());
    let recorder = Arc::new(Recorder {
        seen: Mutex::new(None),
        algs: provider.signature_verification_algorithms,
    });
    let cfg = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("ring supports the default protocol versions")
        .dangerous()
        .with_custom_certificate_verifier(recorder.clone())
        .with_no_client_auth();
    let Ok(client) = base_builder().use_preconfigured_tls(cfg).build() else {
        return ProbeOut::failed("network");
    };
    let out = read_info(&client, &base, ProbeOut::default()).await;
    let seen = *recorder.seen.lock().unwrap_or_else(|e| e.into_inner());
    let Some(fp) = seen.filter(|_| out.reachable) else {
        return ProbeOut::failed("network");
    };
    ProbeOut {
        trusted: false,
        fingerprint: Some(
            fp.iter()
                .map(|b| format!("{b:02X}"))
                .collect::<Vec<_>>()
                .join(":"),
        ),
        phrase: Some(bookeeper_net::phrase::verification_phrase(&fp)),
        ..out
    }
}
