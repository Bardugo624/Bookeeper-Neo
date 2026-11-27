//! The Setup commands. The logic lives in plain functions over `System`, so tests run
//! them against `MockSystem`; the `#[tauri::command]` wrappers only forward.

use bookeeper_setup_core::folder::{self, FolderProblem};
use bookeeper_setup_core::log::Log;
use bookeeper_setup_core::ops::{self, InstallOptions, Mode, OpError, MAIN_EXE, UNINSTALLER};
use bookeeper_setup_core::payload::{self, Meta};
use bookeeper_setup_core::progress::{Snapshot, Step};
use bookeeper_setup_core::sys::System;
use bookeeper_setup_core::version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub const PROGRESS_EVENT: &str = "setup://progress";
pub const UNINSTALL_REQUESTED_EVENT: &str = "setup://uninstall-requested";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SetupMode {
    Install,
    Uninstall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Blocked {
    Elevated,
    Incomplete,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadInfo {
    pub version: String,
    pub installed_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstalledInfo {
    pub version: String,
    pub dir: String,
    pub legacy: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    pub dir: String,
    pub desktop_icon: bool,
    pub autostart: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    pub bytes: u64,
    pub has_library: bool,
    pub has_ebooks: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupInfo {
    pub mode: SetupMode,
    pub payload: Option<PayloadInfo>,
    pub installed: Option<InstalledInfo>,
    pub defaults: Defaults,
    pub blocked: Option<Blocked>,
    pub data: DataInfo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProblemCode {
    NeedsAdmin,
    Network,
    NotAbsolute,
    TooLong,
    TooLittleSpace,
    TempTooSmall,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    pub dir: String,
    pub problem: Option<ProblemCode>,
    pub free_bytes: u64,
    pub drive: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequestMode {
    Install,
    Update,
    Repair,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
    pub dir: String,
    pub desktop_icon: bool,
    pub autostart: bool,
    pub mode: RequestMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    AppRunning,
    Payload,
    NsisFailed,
    Timeout,
    Verification,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
}

impl OpResult {
    pub fn done() -> Self {
        Self {
            ok: true,
            error: None,
            code: None,
        }
    }
    pub fn failed(error: ErrorCode) -> Self {
        Self {
            ok: false,
            error: Some(error),
            code: None,
        }
    }
}

impl From<Result<(), OpError>> for OpResult {
    fn from(r: Result<(), OpError>) -> Self {
        match r {
            Ok(()) => Self::done(),
            Err(OpError::AppRunning) => Self::failed(ErrorCode::AppRunning),
            Err(OpError::Payload(_)) => Self::failed(ErrorCode::Payload),
            Err(OpError::NsisFailed { code }) => Self {
                ok: false,
                error: Some(ErrorCode::NsisFailed),
                code: Some(code),
            },
            Err(OpError::TimedOut) => Self::failed(ErrorCode::Timeout),
            Err(OpError::Verification(_)) => Self::failed(ErrorCode::Verification),
            Err(OpError::Io(_)) => Self::failed(ErrorCode::Io),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub step: StepId,
    pub fraction: f32,
    pub done: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StepId {
    Prepare,
    Copy,
    Icons,
    Finish,
    RemoveApp,
    RemoveData,
}

impl From<Snapshot> for ProgressEvent {
    fn from(s: Snapshot) -> Self {
        let step = match s.step {
            Step::Prepare => StepId::Prepare,
            Step::Copy => StepId::Copy,
            Step::Icons => StepId::Icons,
            Step::Finish => StepId::Finish,
            Step::RemoveApp => StepId::RemoveApp,
            Step::RemoveData => StepId::RemoveData,
        };
        Self {
            step,
            fraction: s.fraction,
            done: s.done,
        }
    }
}

/// What the commands need to know about this run.
pub struct Context {
    pub setup_exe: PathBuf,
    /// Started with `--uninstall` (windowed).
    pub uninstall_requested: bool,
    /// Windows only: elsewhere the Setup just says so.
    pub supported: bool,
}

pub struct AppState {
    pub sys: Box<dyn System>,
    pub ctx: Context,
    pub log: Log,
    pub smoke: bool,
}

/// The attached installer, if this file has one. A damaged tail counts as none.
pub fn read_payload(setup_exe: &Path) -> Option<Meta> {
    let mut f = File::open(setup_exe).ok()?;
    let len = f.metadata().ok()?.len();
    payload::locate(&mut f, len).ok().flatten().map(|l| l.meta)
}

fn same_folder(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| {
        p.to_string_lossy()
            .trim_end_matches(['\\', '/'])
            .replace('/', "\\")
            .to_lowercase()
    };
    norm(a) == norm(b)
}

fn blocked_reason(
    sys: &dyn System,
    ctx: &Context,
    has_payload: bool,
    uninstall_mode: bool,
) -> Option<Blocked> {
    if !ctx.supported {
        Some(Blocked::Unsupported)
    } else if sys.is_elevated() {
        Some(Blocked::Elevated)
    } else if !has_payload && !uninstall_mode {
        Some(Blocked::Incomplete)
    } else {
        None
    }
}

pub fn build_info(sys: &dyn System, ctx: &Context) -> SetupInfo {
    let meta = read_payload(&ctx.setup_exe);
    let state = ops::read_state(sys);
    let installed = state.as_ref().map(|s| InstalledInfo {
        version: s.version.clone(),
        dir: s.dir.to_string_lossy().into_owned(),
        legacy: version::is_legacy(&s.version),
    });

    // The light Setup is the uninstaller: only with --uninstall, or from the installed folder.
    let in_install_dir = state
        .as_ref()
        .zip(ctx.setup_exe.parent())
        .is_some_and(|(s, parent)| same_folder(&s.dir, parent));
    let uninstall_mode = meta.is_none() && (ctx.uninstall_requested || in_install_dir);
    let mode = if uninstall_mode {
        SetupMode::Uninstall
    } else {
        SetupMode::Install
    };

    let default_dir = state
        .as_ref()
        .map(|s| s.dir.clone())
        .unwrap_or_else(|| sys.local_app_data().join("Bookeeper"));
    let summary = ops::data_summary(sys);

    SetupInfo {
        mode,
        payload: meta.as_ref().map(|m| PayloadInfo {
            version: m.version.clone(),
            installed_bytes: m.installed_bytes,
        }),
        installed,
        defaults: Defaults {
            dir: default_dir.to_string_lossy().into_owned(),
            desktop_icon: true,
            autostart: false,
        },
        blocked: blocked_reason(sys, ctx, meta.is_some(), uninstall_mode),
        data: DataInfo {
            bytes: summary.bytes,
            has_library: summary.has_library,
            has_ebooks: summary.has_ebooks,
        },
    }
}

fn nearest_existing(dir: &Path) -> PathBuf {
    let mut probe = dir.to_path_buf();
    while !probe.exists() && probe.pop() {}
    // Nothing exists (a Windows path on another host): ask about the folder itself.
    if probe.as_os_str().is_empty() {
        return dir.to_path_buf();
    }
    probe
}

fn drive_of(dir: &Path) -> String {
    let s = dir.to_string_lossy();
    let b = s.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        s[..2].to_uppercase()
    } else {
        String::new()
    }
}

fn is_empty_dir(dir: &Path) -> bool {
    std::fs::read_dir(dir).is_ok_and(|mut rd| rd.next().is_none())
}

pub fn check_target(sys: &dyn System, chosen: &str, meta: Option<&Meta>) -> DirCheck {
    let chosen = Path::new(chosen.trim());
    let dir = folder::target_for_choice(chosen, is_empty_dir(chosen));
    check_exact(sys, dir, meta)
}

/// Checks a folder as it is: no `Bookeeper` suffix is added (it was already chosen).
pub fn check_exact(sys: &dyn System, dir: PathBuf, meta: Option<&Meta>) -> DirCheck {
    let drive = drive_of(&dir);
    let result = |problem: Option<ProblemCode>, free_bytes: u64| DirCheck {
        dir: dir.to_string_lossy().into_owned(),
        problem,
        free_bytes,
        drive: drive.clone(),
    };

    if let Some(p) = folder::check_path(&dir) {
        let code = match p {
            FolderProblem::Network => ProblemCode::Network,
            FolderProblem::TooLong => ProblemCode::TooLong,
            _ => ProblemCode::NotAbsolute,
        };
        return result(Some(code), 0);
    }
    if sys.is_network_path(&dir) {
        return result(Some(ProblemCode::Network), 0);
    }
    let probe = nearest_existing(&dir);
    if !sys.can_write(&probe).unwrap_or(false) {
        return result(
            Some(ProblemCode::NeedsAdmin),
            sys.free_space(&probe).unwrap_or(0),
        );
    }
    let free_target = sys.free_space(&probe).unwrap_or(0);
    let free_temp = sys.free_space(&sys.temp_dir()).unwrap_or(0);
    let (installed, payload_bytes) = meta.map_or((0, 0), |m| (m.installed_bytes, m.payload.bytes));
    match folder::check_space(free_target, free_temp, installed, payload_bytes) {
        Some(FolderProblem::TooLittleSpace { free }) => {
            result(Some(ProblemCode::TooLittleSpace), free)
        }
        Some(FolderProblem::TempTooSmall { free }) => result(Some(ProblemCode::TempTooSmall), free),
        _ => result(None, free_target),
    }
}

fn mode_of(m: RequestMode) -> Mode {
    match m {
        RequestMode::Install => Mode::Install,
        RequestMode::Update => Mode::Update,
        RequestMode::Repair => Mode::Repair,
    }
}

pub fn run_install(
    state: &AppState,
    request: &InstallRequest,
    emit: &mut dyn FnMut(ProgressEvent),
) -> OpResult {
    let sys = state.sys.as_ref();
    let meta = read_payload(&state.ctx.setup_exe);
    if blocked_reason(sys, &state.ctx, meta.is_some(), false).is_some() {
        state.log.line("install: refused, the Setup is blocked");
        return OpResult::failed(ErrorCode::Io);
    }
    // The UI sends a folder `check_dir` already corrected (or the installed one): use it as is.
    let check = check_exact(sys, PathBuf::from(request.dir.trim()), meta.as_ref());
    if let Some(problem) = check.problem {
        state
            .log
            .line(&format!("install: refused, folder problem {problem:?}"));
        return OpResult::failed(ErrorCode::Io);
    }
    let opts = InstallOptions {
        dir: PathBuf::from(check.dir),
        desktop_icon: request.desktop_icon,
        autostart: request.autostart,
        mode: mode_of(request.mode),
    };
    let mut report = |s: Snapshot| emit(s.into());
    ops::install(sys, &state.ctx.setup_exe, &opts, &mut report, &state.log).into()
}

/// The folder to remove: the registered one, else the one the Setup sits in.
pub fn uninstall_dir(sys: &dyn System, setup_exe: &Path) -> Option<PathBuf> {
    ops::read_state(sys).map(|s| s.dir).or_else(|| {
        // Only a folder that really holds an installation counts.
        setup_exe
            .parent()
            .filter(|p| p.join(UNINSTALLER).is_file())
            .map(Path::to_path_buf)
    })
}

pub fn run_uninstall(
    state: &AppState,
    delete_data: bool,
    emit: &mut dyn FnMut(ProgressEvent),
) -> OpResult {
    let sys = state.sys.as_ref();
    // Incomplete is about installing; removing needs only a supported, non-elevated system.
    if blocked_reason(sys, &state.ctx, true, true).is_some() {
        state.log.line("uninstall: refused, the Setup is blocked");
        return OpResult::failed(ErrorCode::Io);
    }
    let Some(dir) = uninstall_dir(sys, &state.ctx.setup_exe) else {
        return OpResult::failed(ErrorCode::Io);
    };
    let mut report = |s: Snapshot| emit(s.into());
    ops::uninstall(sys, &dir, delete_data, &mut report, &state.log).into()
}

/// Starts the installed app. Returns the error text when it cannot.
pub fn launch(sys: &dyn System, setup_exe: &Path) -> io::Result<()> {
    let dir =
        uninstall_dir(sys, setup_exe).ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
    std::process::Command::new(dir.join(MAIN_EXE))
        .current_dir(&dir)
        .spawn()
        .map(|_| ())
}

/// No WebView2: the full Setup unpacks the classic installer and starts it (it installs
/// WebView2 itself); the light one starts `uninstall.exe`. Nothing here needs a window.
pub fn webview2_fallback(sys: &dyn System, setup_exe: &Path, log: &Log) -> io::Result<()> {
    if let Some(meta) = read_payload(setup_exe) {
        let path = extract_installer(sys, setup_exe, &meta)?;
        log.line(&format!("no WebView2: starting {}", path.display()));
        std::process::Command::new(&path).spawn()?;
    } else {
        let dir = uninstall_dir(sys, setup_exe)
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))?;
        let path = dir.join(UNINSTALLER);
        log.line(&format!("no WebView2: starting {}", path.display()));
        std::process::Command::new(&path).spawn()?;
    }
    Ok(())
}

fn extract_installer(sys: &dyn System, setup_exe: &Path, meta: &Meta) -> io::Result<PathBuf> {
    let mut f = File::open(setup_exe)?;
    let len = f.metadata()?.len();
    let located = payload::locate(&mut f, len)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos());
    let dir = sys
        .temp_dir()
        .join(format!("bookeeper-setup-{}-{nanos:x}", std::process::id()));
    std::fs::create_dir(&dir)?;
    // Only the file name of the metadata is used, so a hostile name cannot leave the folder.
    let name = Path::new(&meta.payload.name)
        .file_name()
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))?;
    let out_path = dir.join(name);
    let mut out = File::create(&out_path)?;
    f.seek(SeekFrom::Start(located.payload_offset))?;
    let mut hasher = Sha256::new();
    let mut remaining = located.payload_len;
    let mut buf = vec![0u8; 256 * 1024];
    while remaining > 0 {
        let n = buf.len().min(remaining as usize);
        f.read_exact(&mut buf[..n])?;
        hasher.update(&buf[..n]);
        out.write_all(&buf[..n])?;
        remaining -= n as u64;
    }
    out.flush()?;
    drop(out);
    let hex: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if !hex.eq_ignore_ascii_case(&meta.payload.sha256) {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "installer hash mismatch",
        ));
    }
    Ok(out_path)
}

type AppStateRef<'a> = State<'a, Arc<AppState>>;

#[tauri::command]
pub fn setup_info(state: AppStateRef<'_>) -> SetupInfo {
    build_info(state.sys.as_ref(), &state.ctx)
}

#[tauri::command]
pub fn check_dir(state: AppStateRef<'_>, dir: String) -> DirCheck {
    let meta = read_payload(&state.ctx.setup_exe);
    check_target(state.sys.as_ref(), &dir, meta.as_ref())
}

#[tauri::command]
pub async fn install(
    app: AppHandle,
    state: AppStateRef<'_>,
    request: InstallRequest,
) -> Result<OpResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_install(&state, &request, &mut |e| {
            let _ = app.emit(PROGRESS_EVENT, e);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall(
    app: AppHandle,
    state: AppStateRef<'_>,
    delete_data: bool,
) -> Result<OpResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_uninstall(&state, delete_data, &mut |e| {
            let _ = app.emit(PROGRESS_EVENT, e);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn launch_app(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    launch(state.sys.as_ref(), &state.ctx.setup_exe).map_err(|e| {
        state.log.line(&format!("launch: {e}"));
        e.to_string()
    })?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn log_tail(state: AppStateRef<'_>) -> String {
    state.log.tail(200)
}

#[tauri::command]
pub fn ready(app: AppHandle, state: AppStateRef<'_>) {
    crate::window::show(&app);
    if state.smoke {
        // The CI proves WebView2, the DLLs and the UI by getting here.
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(1));
            std::process::exit(0);
        });
    }
}

#[tauri::command]
pub fn quit(app: AppHandle, code: i32) {
    app.exit(code);
}
