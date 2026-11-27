//! Install, uninstall and the facts about what is installed. Everything goes through
//! `System`, so it runs against `MockSystem` on any platform.

mod run;

use crate::cmdline;
use crate::log::Log;
use crate::payload::{self, FileMeta, Meta};
use crate::progress::{ProgressModel, Signal, Snapshot};
use crate::sys::{InstallState, RunOutcome, System};
pub(crate) use run::same_path;
use run::{create_private_dir, largest_nsis_tmp, remove_tree, run_polled, sha256_hex, Reporter};
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub const MAIN_EXE: &str = "bookeeper-desktop.exe";
pub const UNINSTALLER: &str = "uninstall.exe";
pub const DATA_ID: &str = "org.bookeeper.desktop";
pub const CREDENTIAL_SUFFIX: &str = ".org.bookeeper.desktop";
pub const DESKTOP_LNK: &str = "Bookeeper.lnk";
const REG_APP_KEY: &str = r"Software\bookeeper\Bookeeper";
const REG_VENDOR_KEY: &str = r"Software\bookeeper";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Install,
    Update,
    Repair,
}

#[derive(Debug, Clone)]
pub struct InstallOptions {
    pub dir: PathBuf,
    pub desktop_icon: bool,
    pub autostart: bool,
    pub mode: Mode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DataSummary {
    pub bytes: u64,
    pub has_library: bool,
    pub has_ebooks: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum OpError {
    #[error("Bookeeper is running")]
    AppRunning,
    #[error("bad installer payload: {0}")]
    Payload(String),
    #[error("NSIS exited with code {code}")]
    NsisFailed { code: i32 },
    #[error("NSIS did not finish in time")]
    TimedOut,
    #[error("verification failed: {0}")]
    Verification(String),
    #[error("{0}")]
    Io(String),
}

impl From<io::Error> for OpError {
    fn from(e: io::Error) -> Self {
        OpError::Io(e.to_string())
    }
}

/// The installed app, if the registry points at a folder that holds `bookeeper-desktop.exe`.
pub fn read_state(sys: &dyn System) -> Option<InstallState> {
    let state = sys.install_state().ok()??;
    let raw = state.dir.to_string_lossy();
    let dir = PathBuf::from(raw.trim().trim_matches('"').trim());
    if dir.as_os_str().is_empty() || !dir.join(MAIN_EXE).is_file() {
        return None;
    }
    Some(InstallState {
        dir,
        version: state.version.trim().to_string(),
    })
}

fn dir_bytes(dir: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return 0;
    };
    rd.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_bytes(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

fn data_dirs(sys: &dyn System) -> [PathBuf; 2] {
    [
        sys.app_data().join(DATA_ID),
        sys.local_app_data().join(DATA_ID),
    ]
}

pub fn data_summary(sys: &dyn System) -> DataSummary {
    let dirs = data_dirs(sys);
    DataSummary {
        bytes: dirs.iter().map(|d| dir_bytes(d)).sum(),
        has_library: dirs.iter().any(|d| d.join("bookeeper.sqlite").exists()),
        has_ebooks: dirs.iter().any(|d| d.join("ebooks").exists()),
    }
}

/// Opens the extracted installer read-only, sharing reads only, so nobody can change
/// it while it is hashed and while NSIS runs.
fn open_locked(path: &Path) -> io::Result<File> {
    let mut o = OpenOptions::new();
    o.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        o.share_mode(1); // FILE_SHARE_READ
    }
    o.open(path)
}

struct Extracted {
    /// Held open until the installer has finished.
    _lock: File,
    path: PathBuf,
}

fn extract_payload(
    setup_exe: &Path,
    meta: &Meta,
    offset: u64,
    len: u64,
    work: &Path,
    rep: &mut Reporter,
) -> Result<Extracted, OpError> {
    let name = Path::new(&meta.payload.name)
        .file_name()
        .map_or_else(|| OsString::from("installer.exe"), |n| n.to_os_string());
    let path = work.join(name);
    let mut src = File::open(setup_exe)?;
    src.seek(SeekFrom::Start(offset))?;
    let mut src = src.take(len);
    {
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let n = src.read(&mut buf)?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n])?;
            rep.tick_if_due();
        }
        out.flush()?;
    }
    let mut lock = open_locked(&path)?;
    let size = lock.metadata()?.len();
    if size != meta.payload.bytes {
        return Err(OpError::Verification(format!(
            "installer is {size} bytes, expected {}",
            meta.payload.bytes
        )));
    }
    let hash = sha256_hex(&mut lock, || rep.tick_if_due())?;
    if !hash.eq_ignore_ascii_case(&meta.payload.sha256) {
        return Err(OpError::Verification(
            "installer hash does not match".into(),
        ));
    }
    Ok(Extracted { _lock: lock, path })
}

fn check_file(path: &Path, want: &FileMeta, rep: &mut Reporter) -> Result<(), OpError> {
    let mut f =
        File::open(path).map_err(|e| OpError::Verification(format!("{}: {e}", want.name)))?;
    let size = f.metadata()?.len();
    if size != want.bytes {
        return Err(OpError::Verification(format!(
            "{} is {size} bytes, expected {}",
            want.name, want.bytes
        )));
    }
    let hash = sha256_hex(&mut f, || rep.tick_if_due())?;
    if !hash.eq_ignore_ascii_case(&want.sha256) {
        return Err(OpError::Verification(format!(
            "{} hash does not match",
            want.name
        )));
    }
    Ok(())
}

/// Watches the installed `bookeeper-desktop.exe`. In an update the old file is already
/// there at full size: it counts only after it has been emptied and rewritten.
struct MainWatch {
    exe: PathBuf,
    bytes: u64,
    needs_rewrite: bool,
    emptied: bool,
    complete: bool,
}

impl MainWatch {
    fn new(exe: PathBuf, bytes: u64, mode: Mode) -> Self {
        Self {
            exe,
            bytes,
            needs_rewrite: mode != Mode::Install,
            emptied: false,
            complete: false,
        }
    }

    /// True the first time the file is complete.
    fn poll(&mut self) -> bool {
        if self.complete {
            return false;
        }
        let len = std::fs::metadata(&self.exe)
            .ok()
            .filter(|m| m.is_file())
            .map(|m| m.len());
        if len != Some(self.bytes) {
            self.emptied = true;
            return false;
        }
        if self.needs_rewrite && !self.emptied {
            return false;
        }
        self.complete = true;
        true
    }
}

fn install_estimate(installed_bytes: u64) -> Duration {
    Duration::from_secs((installed_bytes / (6 * 1024 * 1024)).clamp(8, 90))
}

pub fn install(
    sys: &dyn System,
    setup_exe: &Path,
    opts: &InstallOptions,
    report: &mut dyn FnMut(Snapshot),
    log: &Log,
) -> Result<(), OpError> {
    let result = install_inner(sys, setup_exe, opts, report, log);
    match &result {
        Ok(()) => log.line("install: done"),
        Err(e) => log.line(&format!("install: failed: {e}")),
    }
    result
}

fn install_inner(
    sys: &dyn System,
    setup_exe: &Path,
    opts: &InstallOptions,
    report: &mut dyn FnMut(Snapshot),
    log: &Log,
) -> Result<(), OpError> {
    let main_exe = opts.dir.join(MAIN_EXE);
    if sys.is_running(&main_exe)? {
        return Err(OpError::AppRunning);
    }
    log.line(&format!(
        "install: {:?} into {}",
        opts.mode,
        opts.dir.display()
    ));

    let mut file = File::open(setup_exe)?;
    let len = file.metadata()?.len();
    let located = payload::locate(&mut file, len)
        .map_err(|e| OpError::Payload(e.to_string()))?
        .ok_or_else(|| OpError::Payload("this Setup has no installer attached".into()))?;
    drop(file);
    let meta = located.meta;

    let model = ProgressModel::new_install(Instant::now(), install_estimate(meta.installed_bytes));
    let mut rep = Reporter::new(model, report);
    rep.signal(Signal::Tick);

    let work = create_private_dir(&sys.temp_dir())?;
    let outcome = install_in(
        sys,
        setup_exe,
        opts,
        &meta,
        located.payload_offset,
        located.payload_len,
        &work,
        &mut rep,
        log,
    );
    if let Err(e) = remove_tree(&work) {
        log.line(&format!(
            "install: could not remove {}: {e}",
            work.display()
        ));
    }
    outcome?;
    rep.finish();
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn install_in(
    sys: &dyn System,
    setup_exe: &Path,
    opts: &InstallOptions,
    meta: &Meta,
    offset: u64,
    payload_len: u64,
    work: &Path,
    rep: &mut Reporter,
    log: &Log,
) -> Result<(), OpError> {
    let private = work.join("tmp");
    std::fs::create_dir(&private)?;
    let installer = extract_payload(setup_exe, meta, offset, payload_len, work, rep)?;
    rep.signal(Signal::Extracted);

    let args = cmdline::install_args(&opts.dir, opts.mode != Mode::Install);
    let env = [
        (OsString::from("TEMP"), private.clone().into_os_string()),
        (OsString::from("TMP"), private.clone().into_os_string()),
    ];
    log.line(&format!("run: {} {args}", installer.path.display()));

    let main_exe = opts.dir.join(MAIN_EXE);
    let mut watch = MainWatch::new(main_exe.clone(), meta.main.bytes, opts.mode);
    let total = meta.installed_bytes;
    let outcome = run_polled(sys, &installer.path, &args, &env, || {
        if let Some(bytes) = largest_nsis_tmp(&private) {
            rep.signal(Signal::Unpacked { bytes, total });
        }
        if watch.poll() {
            rep.signal(Signal::MainComplete);
        }
        rep.tick_if_due();
    })?;
    match outcome {
        RunOutcome::TimedOut => {
            log.line("exit: timed out");
            return Err(OpError::TimedOut);
        }
        RunOutcome::Exited(code) => {
            log.line(&format!("exit: {code}"));
            if code != 0 {
                return Err(OpError::NsisFailed { code });
            }
        }
    }
    drop(installer);

    check_file(&main_exe, &meta.main, rep)?;
    if !watch.complete {
        rep.signal(Signal::MainComplete);
    }
    rep.signal(Signal::NsisExited);

    // Only a fresh install decides about the desktop icon; updates leave icons alone.
    if opts.mode == Mode::Install && !opts.desktop_icon {
        remove_own_desktop_shortcut(sys, &opts.dir, log);
    }
    if opts.autostart {
        sys.autostart_enable(&main_exe)?;
        log.line("autostart: enabled");
    }
    rep.signal(Signal::IconsDone);
    Ok(())
}

fn remove_own_desktop_shortcut(sys: &dyn System, dir: &Path, log: &Log) {
    let lnk = sys.desktop_dir().join(DESKTOP_LNK);
    if !lnk.exists() {
        return;
    }
    match sys.shortcut_target(&lnk) {
        Ok(Some(t)) if same_path(&t, &dir.join(MAIN_EXE)) => match std::fs::remove_file(&lnk) {
            Ok(()) => log.line("desktop shortcut removed"),
            Err(e) => log.line(&format!("desktop shortcut: {e}")),
        },
        Ok(_) => log.line("desktop shortcut points elsewhere: kept"),
        Err(e) => log.line(&format!("desktop shortcut unreadable: {e}")),
    }
}

pub fn uninstall(
    sys: &dyn System,
    dir: &Path,
    delete_data: bool,
    report: &mut dyn FnMut(Snapshot),
    log: &Log,
) -> Result<(), OpError> {
    let result = uninstall_inner(sys, dir, delete_data, report, log);
    match &result {
        Ok(()) => log.line("uninstall: done"),
        Err(e) => log.line(&format!("uninstall: failed: {e}")),
    }
    result
}

fn uninstall_inner(
    sys: &dyn System,
    dir: &Path,
    delete_data: bool,
    report: &mut dyn FnMut(Snapshot),
    log: &Log,
) -> Result<(), OpError> {
    let main_exe = dir.join(MAIN_EXE);
    if sys.is_running(&main_exe)? {
        return Err(OpError::AppRunning);
    }
    log.line(&format!(
        "uninstall: {} (delete data: {delete_data})",
        dir.display()
    ));

    let model = ProgressModel::new_uninstall(Instant::now(), Duration::from_secs(8), delete_data);
    let mut rep = Reporter::new(model, report);
    rep.signal(Signal::Tick);

    let uninstaller = dir.join(UNINSTALLER);
    if uninstaller.is_file() {
        let args = cmdline::uninstall_args(dir);
        log.line(&format!("run: {} {args}", uninstaller.display()));
        let outcome = run_polled(sys, &uninstaller, &args, &[], || rep.tick_if_due())?;
        match outcome {
            RunOutcome::TimedOut => {
                log.line("exit: timed out");
                return Err(OpError::TimedOut);
            }
            RunOutcome::Exited(code) => {
                log.line(&format!("exit: {code}"));
                if code != 0 {
                    return Err(OpError::NsisFailed { code });
                }
            }
        }
    } else {
        log.line("uninstall.exe not found: nothing to run");
    }
    if main_exe.exists() {
        return Err(OpError::Verification(format!("{MAIN_EXE} is still there")));
    }

    match std::fs::remove_file(&uninstaller) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    if let Err(e) = sys.self_delete_outside(dir) {
        log.line(&format!("self delete: {e}"));
    }
    if std::fs::read_dir(dir).is_ok_and(|mut r| r.next().is_none()) {
        if let Err(e) = std::fs::remove_dir(dir) {
            log.line(&format!("remove folder: {e}"));
        }
    }
    if let Err(e) = sys.autostart_disable() {
        log.line(&format!("autostart: {e}"));
    }
    rep.signal(Signal::AppRemoved);

    if delete_data {
        let n = sys.delete_credentials_with_suffix(CREDENTIAL_SUFFIX)?;
        log.line(&format!("credentials removed: {n}"));
        for d in data_dirs(sys) {
            remove_tree(&d)?;
            rep.tick_if_due();
        }
        sys.delete_registry_tree(REG_APP_KEY)?;
        sys.delete_registry_key_if_empty(REG_VENDOR_KEY)?;
        rep.signal(Signal::DataRemoved);
    }
    rep.finish();
    Ok(())
}
