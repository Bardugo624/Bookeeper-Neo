//! In-app updates: the check, the release notes and the install.
//!
//! The updater is built at run time (`updater_builder()`) from the public key and the
//! address baked in at build time. Without a key the feature is off and nothing touches the
//! network. Everything that does not need the plugin is a plain function so it can be tested.

use serde::Serialize;
use std::future::Future;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

/// Where manifests live unless `BOOKEEPER_UPDATE_BASE` says otherwise.
pub const DEFAULT_BASE: &str = "https://updates.neokeeper.dev/v2";
/// Event with `{ downloaded, total }` sent to the webview while an update downloads.
pub const PROGRESS_EVENT: &str = "update://progress";

/// Public key of the update signature, set at build time. Blank counts as absent.
pub fn pubkey() -> Option<&'static str> {
    option_env!("BOOKEEPER_UPDATER_PUBKEY").filter(|k| !k.trim().is_empty())
}

/// Base address of the manifests, set at build time.
pub fn base() -> &'static str {
    match option_env!("BOOKEEPER_UPDATE_BASE") {
        Some(b) if !b.trim().is_empty() => b,
        _ => DEFAULT_BASE,
    }
}

/// What the webview learns from a check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateState {
    Disabled,
    UpToDate,
    Available {
        version: String,
        notes: String,
        date: Option<String>,
    },
    Error {
        code: String,
    },
}

impl UpdateState {
    fn error(code: &str) -> Self {
        UpdateState::Error {
            code: code.to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    Stable,
    Beta,
}

impl Channel {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "stable" => Ok(Channel::Stable),
            "beta" => Ok(Channel::Beta),
            other => Err(format!("invalid update channel: {other}")),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Channel::Stable => "stable",
            Channel::Beta => "beta",
        }
    }
}

/// `<base>/<channel>/latest.json`; a trailing slash on the base is ignored.
pub fn manifest_url(base: &str, channel: Channel) -> String {
    format!(
        "{}/{}/latest.json",
        base.trim_end_matches('/'),
        channel.name()
    )
}

/// What a request should do, decided before anything is built or sent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Plan {
    /// No key: the feature is off and no request is made.
    Disabled,
    Check {
        url: String,
        channel: Channel,
    },
}

pub fn plan(key: Option<&str>, base: &str, channel: &str) -> Result<Plan, String> {
    let channel = Channel::parse(channel)?;
    if key.is_none_or(|k| k.trim().is_empty()) {
        return Ok(Plan::Disabled);
    }
    Ok(Plan::Check {
        url: manifest_url(base, channel),
        channel,
    })
}

/// Whether `remote` is an update for `current` on `channel`.
///
/// On `stable` only stable releases count, and a beta app gets the same or a later stable
/// (`2.1.0` replaces `2.1.0-beta.3`). On `beta` betas and stables both count when later.
pub fn is_update(current: &semver::Version, remote: &semver::Version, channel: Channel) -> bool {
    if channel == Channel::Stable && !remote.pre.is_empty() {
        return false;
    }
    remote > current
}

/// Which step failed, for the codes that depend on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Check,
    Install,
}

/// `network`, `signature`, `manifest` or `install`.
pub fn error_code(err: &tauri_plugin_updater::Error, stage: Stage) -> &'static str {
    use tauri_plugin_updater::Error as E;
    match err {
        E::Network(_) | E::Reqwest(_) => "network",
        E::Minisign(_)
        | E::Base64(_)
        | E::SignatureUtf8(_)
        | E::SignedVersionMismatch { .. }
        | E::MissingSignedVersion => "signature",
        E::ReleaseNotFound
        | E::Serialization(_)
        | E::Semver(_)
        | E::TargetNotFound(_)
        | E::TargetsNotFound(_)
        | E::EmptyEndpoints
        | E::UrlParse(_)
        | E::InsecureTransportProtocol
        | E::UnsupportedArch
        | E::UnsupportedOs => "manifest",
        _ => match stage {
            Stage::Check => "manifest",
            Stage::Install => "install",
        },
    }
}

fn format_date(d: time::OffsetDateTime) -> Option<String> {
    d.format(&time::format_description::well_known::Rfc3339)
        .ok()
}

fn build<R: tauri::Runtime>(
    app: &AppHandle<R>,
    url: &str,
    channel: Channel,
) -> Result<tauri_plugin_updater::Updater, tauri_plugin_updater::Error> {
    let endpoint = url.parse::<url::Url>()?;
    app.updater_builder()
        .endpoints(vec![endpoint])?
        .version_comparator(move |current, remote| is_update(&current, &remote.version, channel))
        .build()
}

/// Checks the manifest of `channel`. An invalid channel is an `Err`; everything else is a state.
pub async fn check(app: &AppHandle, channel: &str) -> Result<UpdateState, String> {
    let (url, channel) = match plan(pubkey(), base(), channel)? {
        Plan::Disabled => return Ok(UpdateState::Disabled),
        Plan::Check { url, channel } => (url, channel),
    };
    let updater = match build(app, &url, channel) {
        Ok(u) => u,
        Err(e) => return Ok(UpdateState::error(error_code(&e, Stage::Check))),
    };
    Ok(match updater.check().await {
        Ok(None) => UpdateState::UpToDate,
        Ok(Some(u)) => UpdateState::Available {
            version: u.version,
            notes: u.body.unwrap_or_default(),
            date: u.date.and_then(format_date),
        },
        Err(e) => UpdateState::error(error_code(&e, Stage::Check)),
    })
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Downloads, verifies the signature, installs and restarts. The error is a code.
pub async fn install(app: &AppHandle, channel: &str) -> Result<(), String> {
    let (url, channel) = match plan(pubkey(), base(), channel)? {
        Plan::Disabled => return Err("disabled".into()),
        Plan::Check { url, channel } => (url, channel),
    };
    let fail = |e: tauri_plugin_updater::Error| error_code(&e, Stage::Install).to_string();
    let updater = build(app, &url, channel).map_err(fail)?;
    let update = updater
        .check()
        .await
        .map_err(fail)?
        .ok_or_else(|| "manifest".to_string())?;
    let data_dir = app.path().app_data_dir().ok();
    let mut downloaded: u64 = 0;
    let handle = app.clone();
    let download = update.download_and_install(
        move |chunk, total| {
            downloaded += chunk as u64;
            let _ = handle.emit(PROGRESS_EVENT, Progress { downloaded, total });
        },
        || {},
    );
    with_update_marker(data_dir.as_deref(), download)
        .await
        .map_err(fail)?;
    app.restart()
}

/// Runs an update install with the update marker in `dir`: the restart after the install is
/// not a login, so the next start shows the window. An install that fails restarts nothing,
/// so the marker goes again: the next start, maybe a login, keeps `--autostart`.
pub async fn with_update_marker<T, E>(
    dir: Option<&Path>,
    install: impl Future<Output = Result<T, E>>,
) -> Result<T, E> {
    let marker = dir.map(|d| d.join(crate::startup::UPDATE_MARKER));
    if let Some(m) = &marker {
        let _ = std::fs::write(m, b"");
    }
    let result = install.await;
    if let (Err(_), Some(m)) = (&result, &marker) {
        let _ = std::fs::remove_file(m);
    }
    result
}
