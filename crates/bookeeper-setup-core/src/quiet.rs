//! The silent mode: no window, no Tauri, only exit codes (0 done, 2 error, 3 app
//! open, 4 newer version or 0.x) and the Setup log.

use crate::cmdline::{Invocation, QuietInstallArgs, UninstallArgs};
use crate::folder;
use crate::log::Log;
use crate::ops::{self, InstallOptions, Mode, OpError};
use crate::payload;
use crate::sys::System;
use crate::version;
use std::cmp::Ordering;
use std::fs::File;
use std::path::{Path, PathBuf};

pub const DONE: i32 = 0;
pub const ERROR: i32 = 2;
pub const APP_RUNNING: i32 = 3;
pub const NEWER: i32 = 4;

const ALLOW_ELEVATED: &str = "BOOKEEPER_SETUP_ALLOW_ELEVATED";

pub fn run(sys: &dyn System, invocation: &Invocation, setup_exe: &Path) -> i32 {
    let log = Log::open(sys);
    let code = match invocation {
        Invocation::QuietInstall(a) => install(sys, a, setup_exe, &log),
        Invocation::Uninstall(a) => uninstall(sys, a, &log),
        _ => {
            log.line("quiet: not a silent invocation");
            ERROR
        }
    };
    log.line(&format!("quiet: exit {code}"));
    code
}

fn elevated_blocked(sys: &dyn System, log: &Log) -> bool {
    let allowed = std::env::var(ALLOW_ELEVATED).is_ok_and(|v| v == "1");
    if sys.is_elevated() && !allowed {
        log.line("quiet: refusing to run with administrator rights");
        return true;
    }
    false
}

fn code_for(e: &OpError) -> i32 {
    match e {
        OpError::AppRunning => APP_RUNNING,
        _ => ERROR,
    }
}

fn install(sys: &dyn System, a: &QuietInstallArgs, setup_exe: &Path, log: &Log) -> i32 {
    if elevated_blocked(sys, log) {
        return ERROR;
    }
    let meta = match File::open(setup_exe).map_err(|e| e.to_string()).and_then(|mut f| {
        let len = f.metadata().map_err(|e| e.to_string())?.len();
        payload::locate(&mut f, len).map_err(|e| e.to_string())
    }) {
        Ok(Some(l)) => l.meta,
        Ok(None) => {
            log.line("quiet: this Setup has no installer attached");
            return ERROR;
        }
        Err(e) => {
            log.line(&format!("quiet: cannot read the installer: {e}"));
            return ERROR;
        }
    };

    let installed = ops::read_state(sys);
    let (mode, dir) = match &installed {
        None => (Mode::Install, a.dir.clone().unwrap_or_else(|| sys.local_app_data().join("Bookeeper"))),
        Some(st) => {
            if version::is_legacy(&st.version) {
                log.line(&format!("quiet: version {} is too old to update", st.version));
                return NEWER;
            }
            let mode = match version::compare(&st.version, &meta.version) {
                Some(Ordering::Equal) => Mode::Repair,
                Some(Ordering::Less) => Mode::Update,
                Some(Ordering::Greater) => {
                    log.line(&format!("quiet: version {} is newer than {}", st.version, meta.version));
                    return NEWER;
                }
                None => {
                    log.line(&format!("quiet: cannot compare {} with {}", st.version, meta.version));
                    return ERROR;
                }
            };
            if a.dir.as_deref().is_some_and(|d| !ops::same_path(d, &st.dir)) {
                log.line("quiet: Bookeeper is installed elsewhere; --dir must match");
                return ERROR;
            }
            (mode, st.dir.clone())
        }
    };

    if let Some(problem) = space_problem(sys, &dir, &meta) {
        log.line(&format!("quiet: {problem:?}"));
        return ERROR;
    }

    let opts = InstallOptions { dir, desktop_icon: a.desktop_icon, autostart: a.autostart, mode };
    match ops::install(sys, setup_exe, &opts, &mut |_| {}, log) {
        Ok(()) => DONE,
        Err(e) => code_for(&e),
    }
}

fn space_problem(sys: &dyn System, dir: &Path, meta: &payload::Meta) -> Option<folder::FolderProblem> {
    // The folder may not exist yet: ask about the nearest folder that does.
    let mut probe: PathBuf = dir.to_path_buf();
    while !probe.exists() && probe.pop() {}
    let free_target = sys.free_space(&probe).ok()?;
    let free_temp = sys.free_space(&sys.temp_dir()).ok()?;
    folder::check_space(free_target, free_temp, meta.installed_bytes, meta.payload.bytes)
}

fn uninstall(sys: &dyn System, a: &UninstallArgs, log: &Log) -> i32 {
    if elevated_blocked(sys, log) {
        return ERROR;
    }
    let dir = match a.dir.clone().or_else(|| ops::read_state(sys).map(|s| s.dir)) {
        Some(d) => d,
        None => {
            log.line("quiet: Bookeeper is not installed");
            return ERROR;
        }
    };
    // Silent and passive runs keep the library unless --delete-data says otherwise.
    match ops::uninstall(sys, &dir, a.delete_data, &mut |_| {}, log) {
        Ok(()) => DONE,
        Err(e) => code_for(&e),
    }
}
