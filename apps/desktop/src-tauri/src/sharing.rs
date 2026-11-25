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
    /// `port_in_use`, `password_required`, `tls` or `mdns`.
    pub error: Option<String>,
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
    identity: Identity,
    announcer: Option<Announcer>,
    mdns_failed: bool,
}

struct Inner {
    prefs: Prefs,
    running: Option<Running>,
    /// Why the last attempt to start failed.
    error: Option<&'static str>,
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
            }),
        }))
    }

    /// Starts sharing again when the saved preference says so (app launch).
    pub async fn restore(&self) -> SharingStatus {
        let mut inner = self.0.inner.lock().await;
        if inner.prefs.enabled && inner.running.is_none() {
            let port = inner.prefs.port;
            if let Err(code) = self.start_locked(&mut inner, port).await {
                inner.error = Some(code);
            }
        }
        self.status_of(&inner)
    }

    pub async fn status(&self) -> SharingStatus {
        let inner = self.0.inner.lock().await;
        self.status_of(&inner)
    }

    /// Turns sharing on or off; `port` replaces the saved port when given.
    pub async fn set(&self, enabled: bool, port: Option<u16>) -> SharingStatus {
        let mut inner = self.0.inner.lock().await;
        inner.error = None;
        let port = port.unwrap_or(inner.prefs.port);
        if !enabled {
            self.stop_locked(&mut inner).await;
            inner.prefs = Prefs {
                enabled: false,
                port,
            };
            save_prefs(&self.0.dir, &inner.prefs);
            return self.status_of(&inner);
        }
        let same = inner.running.as_ref().is_some_and(|r| {
            // Port 0 asks for any port: keep what is bound.
            port == inner.prefs.port || port == r.port
        });
        if !same {
            self.stop_locked(&mut inner).await;
        }
        if inner.running.is_none() {
            match self.start_locked(&mut inner, port).await {
                Ok(()) => {}
                Err(code) => {
                    // Nothing opened: the saved preference stays off.
                    inner.error = Some(code);
                    inner.prefs.enabled = false;
                    save_prefs(&self.0.dir, &inner.prefs);
                    return self.status_of(&inner);
                }
            }
        }
        inner.prefs = Prefs {
            enabled: true,
            port,
        };
        save_prefs(&self.0.dir, &inner.prefs);
        self.status_of(&inner)
    }

    /// Stops the server without touching the saved preference (app exit).
    pub async fn shutdown(&self) {
        let mut inner = self.0.inner.lock().await;
        self.stop_locked(&mut inner).await;
    }

    fn status_of(&self, inner: &Inner) -> SharingStatus {
        let (port, identity) = match &inner.running {
            Some(r) => (r.port, Some(r.identity.clone())),
            None => (
                inner.prefs.port,
                Identity::load(&tls_dir(&self.0.dir)).ok().flatten(),
            ),
        };
        let mut error = inner.error.map(str::to_string);
        if error.is_none() && inner.running.as_ref().is_some_and(|r| r.mdns_failed) {
            error = Some("mdns".into());
        }
        SharingStatus {
            enabled: inner.prefs.enabled,
            running: inner.running.is_some(),
            port,
            addresses: private_ipv4()
                .into_iter()
                .map(|ip| format!("https://{ip}:{port}"))
                .collect(),
            phrase: identity
                .as_ref()
                .map(|i| bookeeper_net::phrase::verification_phrase(&i.fingerprint)),
            fingerprint: identity.map(|i| i.fingerprint_hex()),
            error,
        }
    }

    async fn start_locked(&self, inner: &mut Inner, port: u16) -> Result<(), &'static str> {
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

        let listener =
            TcpListener::bind(SocketAddr::new(self.0.listen, port)).map_err(|_| "port_in_use")?;
        listener.set_nonblocking(true).map_err(|_| "port_in_use")?;
        let bound = listener.local_addr().map_err(|_| "port_in_use")?.port();

        let app = network_router(&self.0.state);
        let handle = axum_server::Handle::<SocketAddr>::new();
        let server = axum_server::from_tcp(listener)
            .map_err(|_| "port_in_use")?
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
            match tokio::task::spawn_blocking(move || announce(bound)).await {
                Ok(Ok(a)) => announcer = Some(a),
                _ => mdns_failed = true,
            }
        }
        inner.running = Some(Running {
            handle,
            task,
            port: bound,
            identity,
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
