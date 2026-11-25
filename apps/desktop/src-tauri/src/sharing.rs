//! Network sharing: the app's core router served over TLS on the local network.
//!
//! The listener, the mDNS announcement and the saved preference live behind one
//! [`Sharing`] handle. The port is open only while sharing is on.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::Request;
use axum::http::{header, HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::Response;
use bookeeper_core::{AppState, ServerInfo, SetupPolicy, TlsMode};
use bookeeper_net::mdns::{self, Announcement, Announcer};
use bookeeper_net::tls::Identity;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// Port used until the user chooses another one.
pub const DEFAULT_PORT: u16 = 7842;
/// Time connections get to finish when sharing stops.
const GRACE: Duration = Duration::from_secs(10);
const PREFS_FILE: &str = "sharing.json";

/// What the settings screen shows.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct SharingStatus {
    /// The saved preference.
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    /// `https://<ip>:<port>` for every private IPv4 address of the machine.
    pub addresses: Vec<String>,
    pub fingerprint: Option<String>,
    /// Six-word verification phrase.
    pub phrase: Option<String>,
    /// `port_in_use` (address taken), `port_not_allowed` (permission denied),
    /// `bind_failed` (any other failure opening the port), `password_required`,
    /// `tls` or `mdns`.
    pub error: Option<String>,
    /// The port a failed change tried to open; `port` is then still the one in use.
    pub attempted_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Prefs {
    enabled: bool,
    port: u16,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            enabled: false,
            port: DEFAULT_PORT,
        }
    }
}

struct Running {
    handle: axum_server::Handle<SocketAddr>,
    task: JoinHandle<()>,
    port: u16,
    /// Computed once when sharing starts.
    fingerprint: String,
    phrase: String,
    announcer: Option<Announcer>,
    mdns_failed: bool,
}

struct Inner {
    prefs: Prefs,
    running: Option<Running>,
    /// Why the last attempt to start failed.
    error: Option<&'static str>,
    /// Port of the last failed attempt to open.
    attempted_port: Option<u16>,
    /// Fingerprint and phrase of the last identity used, kept after stopping.
    last_identity: Option<(String, String)>,
}

/// What `status_of` needs from the locked state; the slow parts are added outside the lock.
struct Snapshot {
    enabled: bool,
    running: bool,
    port: u16,
    identity: Option<(String, String)>,
    error: Option<String>,
    attempted_port: Option<u16>,
    /// Set when the identity is not in memory and must be read from disk.
    tls_dir: Option<PathBuf>,
}

/// A port that is bound and ready, before the server is started on it.
struct Bound {
    listener: TcpListener,
    port: u16,
    config: Arc<rustls::ServerConfig>,
    fingerprint: String,
    phrase: String,
}

/// Maps the failure of opening a port to the code the settings screen shows.
pub fn bind_error_code(kind: std::io::ErrorKind) -> &'static str {
    match kind {
        std::io::ErrorKind::AddrInUse => "port_in_use",
        std::io::ErrorKind::PermissionDenied => "port_not_allowed",
        _ => "bind_failed",
    }
}

struct Shared {
    dir: PathBuf,
    state: AppState,
    listen: IpAddr,
    mdns: bool,
    inner: Mutex<Inner>,
}

/// Owner of the sharing server. Cheap to clone.
#[derive(Clone)]
pub struct Sharing(Arc<Shared>);

impl Sharing {
    /// Sharing for the library in `state`, keeping its files under `dir`.
    pub fn new(dir: &Path, state: AppState) -> Sharing {
        Sharing::with_options(dir, state, IpAddr::V4(Ipv4Addr::UNSPECIFIED), true)
    }

    /// Like [`Sharing::new`] with an explicit listen address and mDNS switch (tests).
    pub fn with_options(dir: &Path, state: AppState, listen: IpAddr, mdns: bool) -> Sharing {
        let prefs = load_prefs(dir);
        Sharing(Arc::new(Shared {
            dir: dir.to_path_buf(),
            state,
            listen,
            mdns,
            inner: Mutex::new(Inner {
                prefs,
                running: None,
                error: None,
                attempted_port: None,
                last_identity: None,
            }),
        }))
    }

    /// Starts sharing again when the saved preference says so (app launch).
    pub async fn restore(&self) -> SharingStatus {
        let snap = {
            let mut inner = self.0.inner.lock().await;
            if inner.prefs.enabled && inner.running.is_none() {
                let port = inner.prefs.port;
                if let Err(code) = self.start_locked(&mut inner, port).await {
                    inner.error = Some(code);
                    inner.attempted_port = Some(port);
                }
            }
            self.snapshot(&inner)
        };
        self.finish(snap).await
    }

    pub async fn status(&self) -> SharingStatus {
        let snap = self.snapshot(&*self.0.inner.lock().await);
        self.finish(snap).await
    }

    /// Turns sharing on or off; `port` replaces the saved port when given.
    pub async fn set(&self, enabled: bool, port: Option<u16>) -> SharingStatus {
        let snap = {
            let mut inner = self.0.inner.lock().await;
            self.set_locked(&mut inner, enabled, port).await;
            self.snapshot(&inner)
        };
        self.finish(snap).await
    }

    async fn set_locked(&self, inner: &mut Inner, enabled: bool, port: Option<u16>) {
        inner.error = None;
        inner.attempted_port = None;
        let port = port.unwrap_or(inner.prefs.port);
        if !enabled {
            self.stop_locked(inner).await;
            inner.prefs = Prefs {
                enabled: false,
                port,
            };
            save_prefs(&self.0.dir, &inner.prefs);
            return;
        }
        let same = inner.running.as_ref().is_some_and(|r| {
            // Port 0 asks for any port: keep what is bound.
            port == inner.prefs.port || port == r.port
        });
        if inner.running.is_some() && !same {
            // Open the new port first: only if that works does the old server stop.
            match self.bind(port).await {
                Ok(bound) => {
                    self.stop_locked(inner).await;
                    if let Err(code) = self.launch(inner, bound).await {
                        inner.error = Some(code);
                        inner.attempted_port = Some(port);
                        inner.prefs.enabled = false;
                        save_prefs(&self.0.dir, &inner.prefs);
                        return;
                    }
                }
                Err(code) => {
                    // Sharing stays on the old port.
                    inner.error = Some(code);
                    inner.attempted_port = Some(port);
                    return;
                }
            }
        } else if inner.running.is_none() {
            if let Err(code) = self.start_locked(inner, port).await {
                // Nothing opened: the saved preference stays off.
                inner.error = Some(code);
                inner.attempted_port = Some(port);
                inner.prefs.enabled = false;
                save_prefs(&self.0.dir, &inner.prefs);
                return;
            }
        }
        inner.prefs = Prefs {
            enabled: true,
            port,
        };
        save_prefs(&self.0.dir, &inner.prefs);
    }

    /// Stops the server without touching the saved preference (app exit).
    pub async fn shutdown(&self) {
        let mut inner = self.0.inner.lock().await;
        self.stop_locked(&mut inner).await;
    }

    /// Copies what the status needs; cheap, so the lock is held only briefly.
    fn snapshot(&self, inner: &Inner) -> Snapshot {
        let (port, identity) = match &inner.running {
            Some(r) => (r.port, Some((r.fingerprint.clone(), r.phrase.clone()))),
            None => (inner.prefs.port, inner.last_identity.clone()),
        };
        let mut error = inner.error.map(str::to_string);
        if error.is_none() && inner.running.as_ref().is_some_and(|r| r.mdns_failed) {
            error = Some("mdns".into());
        }
        Snapshot {
            enabled: inner.prefs.enabled,
            running: inner.running.is_some(),
            port,
            tls_dir: identity.is_none().then(|| tls_dir(&self.0.dir)),
            identity,
            error,
            attempted_port: inner.attempted_port,
        }
    }

    /// Adds the blocking parts (interface list, certificate on disk) off the runtime
    /// and outside the lock.
    async fn finish(&self, snap: Snapshot) -> SharingStatus {
        let tls = snap.tls_dir.clone();
        let (ips, loaded) = tokio::task::spawn_blocking(move || {
            let loaded = tls
                .and_then(|d| Identity::load(&d).ok().flatten())
                .map(|i| {
                    (
                        i.fingerprint_hex(),
                        bookeeper_net::phrase::verification_phrase(&i.fingerprint),
                    )
                });
            (private_ipv4(), loaded)
        })
        .await
        .unwrap_or_default();
        let port = snap.port;
        let (fingerprint, phrase) = match snap.identity.or(loaded) {
            Some((f, p)) => (Some(f), Some(p)),
            None => (None, None),
        };
        SharingStatus {
            enabled: snap.enabled,
            running: snap.running,
            port,
            addresses: ips
                .into_iter()
                .map(|ip| format!("https://{ip}:{port}"))
                .collect(),
            fingerprint,
            phrase,
            error: snap.error,
            attempted_port: snap.attempted_port,
        }
    }

    async fn start_locked(&self, inner: &mut Inner, port: u16) -> Result<(), &'static str> {
        let bound = self.bind(port).await?;
        self.launch(inner, bound).await
    }

    /// Checks the preconditions and opens the port, without starting anything on it.
    async fn bind(&self, port: u16) -> Result<Bound, &'static str> {
        if !has_owner_password(&self.0.state).await {
            return Err("password_required");
        }
        let dir = tls_dir(&self.0.dir);
        let identity =
            tokio::task::spawn_blocking(move || Identity::load_or_create(&dir, &identity_names()))
                .await
                .map_err(|_| "tls")?
                .map_err(|e| {
                    tracing::warn!("sharing identity: {e}");
                    "tls"
                })?;
        let config = identity.server_config().map_err(|e| {
            tracing::warn!("sharing tls config: {e}");
            "tls"
        })?;
        bookeeper_net::install_crypto_provider();

        let open = |e: std::io::Error| bind_error_code(e.kind());
        let listener = TcpListener::bind(SocketAddr::new(self.0.listen, port)).map_err(open)?;
        listener.set_nonblocking(true).map_err(open)?;
        let port = listener.local_addr().map_err(open)?.port();
        Ok(Bound {
            listener,
            port,
            config,
            fingerprint: identity.fingerprint_hex(),
            phrase: bookeeper_net::phrase::verification_phrase(&identity.fingerprint),
        })
    }

    /// Serves on an already open port and announces it.
    async fn launch(&self, inner: &mut Inner, bound: Bound) -> Result<(), &'static str> {
        let Bound {
            listener,
            port: bound_port,
            config,
            fingerprint,
            phrase,
        } = bound;
        let app = network_router(&self.0.state);
        let handle = axum_server::Handle::<SocketAddr>::new();
        let server = axum_server::from_tcp(listener)
            .map_err(|e| bind_error_code(e.kind()))?
            .handle(handle.clone())
            .acceptor(axum_server::tls_rustls::RustlsAcceptor::new(
                axum_server::tls_rustls::RustlsConfig::from_config(config),
            ));
        let task = tokio::spawn(async move {
            if let Err(e) = server.serve(app.into_make_service()).await {
                tracing::warn!("sharing server stopped: {e}");
            }
        });

        let mut announcer = None;
        let mut mdns_failed = false;
        if self.0.mdns && !self.0.listen.is_loopback() {
            match tokio::task::spawn_blocking(move || announce(bound_port)).await {
                Ok(Ok(a)) => announcer = Some(a),
                _ => mdns_failed = true,
            }
        }
        inner.last_identity = Some((fingerprint.clone(), phrase.clone()));
        inner.running = Some(Running {
            handle,
            task,
            port: bound_port,
            fingerprint,
            phrase,
            announcer,
            mdns_failed,
        });
        Ok(())
    }

    async fn stop_locked(&self, inner: &mut Inner) {
        let Some(running) = inner.running.take() else {
            return;
        };
        let Running {
            handle,
            mut task,
            announcer,
            ..
        } = running;
        if let Some(a) = announcer {
            // Withdrawing the announcement waits on the network thread.
            let _ = tokio::task::spawn_blocking(move || drop(a)).await;
        }
        handle.graceful_shutdown(Some(GRACE));
        if tokio::time::timeout(GRACE + Duration::from_secs(1), &mut task)
            .await
            .is_err()
        {
            task.abort();
            let _ = task.await;
        }
    }
}

fn tls_dir(dir: &Path) -> PathBuf {
    dir.join("tls").join("self")
}

fn load_prefs(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join(PREFS_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_prefs(dir: &Path, prefs: &Prefs) {
    let Ok(json) = serde_json::to_vec_pretty(prefs) else {
        return;
    };
    if let Err(e) = crate::files::write_atomic(&dir.join(PREFS_FILE), &json) {
        tracing::warn!("cannot save the sharing preference: {e}");
    }
}

/// True when the library's owner has a password, the condition for sharing.
async fn has_owner_password(state: &AppState) -> bool {
    state
        .db
        .run(|conn| {
            conn.query_row(
                "SELECT COUNT(*) FROM users WHERE role = 'owner' AND password_hash IS NOT NULL",
                [],
                |r| r.get::<_, i64>(0),
            )
        })
        .await
        .is_ok_and(|n| n > 0)
}

fn host_name() -> String {
    gethostname::gethostname()
        .to_string_lossy()
        .trim()
        .to_string()
}

fn identity_names() -> Vec<String> {
    let mut names = vec!["localhost".to_string()];
    let host = host_name();
    if !host.is_empty() && host != "localhost" {
        names.push(host);
    }
    names.extend(private_ipv4().into_iter().map(|ip| ip.to_string()));
    names
}

fn announce(port: u16) -> Result<Announcer, bookeeper_net::NetError> {
    let host = host_name();
    let instance = if host.is_empty() {
        "Bookeeper".to_string()
    } else {
        format!("Bookeeper su {host}")
    };
    mdns::announce(&Announcement {
        instance: mdns::sanitize_instance(&instance),
        port,
        version: bookeeper_core::VERSION.to_string(),
        tls: "self".to_string(),
        url: None,
    })
}

/// Private IPv4 addresses of the machine's interfaces, loopback excluded.
pub fn private_ipv4() -> Vec<Ipv4Addr> {
    let mut out: Vec<Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            IpAddr::V4(ip) if ip.is_private() => Some(ip),
            _ => None,
        })
        .collect();
    out.sort();
    out.dedup();
    out
}

fn set_if_missing(res: &mut Response, name: HeaderName, value: &'static str) {
    res.headers_mut()
        .entry(name)
        .or_insert(HeaderValue::from_static(value));
}

async fn security_headers(req: Request, next: Next) -> Response {
    let is_api = req.uri().path().starts_with("/api/");
    let mut res = next.run(req).await;
    set_if_missing(&mut res, header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    set_if_missing(&mut res, header::REFERRER_POLICY, "no-referrer");
    set_if_missing(&mut res, header::X_FRAME_OPTIONS, "DENY");
    if is_api
        && !res.headers().contains_key(header::CACHE_CONTROL)
        && !res.headers().contains_key(header::ETAG)
    {
        set_if_missing(&mut res, header::CACHE_CONTROL, "no-store");
    }
    res
}

/// The core router as the network sees it: it says it is self-signed (so a phone
/// is not told it is ready) and it never creates a library. `CodeRequired` is
/// the guarantee: a setup code is only ever issued by the standalone server's
/// command line, never by the app, so `POST /setup` cannot succeed from here.
/// The in-process state is untouched: this is a clone with its own description.
pub fn network_router(state: &AppState) -> axum::Router {
    let mut state = state.clone().with_server(ServerInfo {
        tls: TlsMode::SelfSigned,
        public_url: None,
    });
    state.setup_policy = SetupPolicy::CodeRequired;
    bookeeper_core::router(state).layer(middleware::from_fn(security_headers))
}
