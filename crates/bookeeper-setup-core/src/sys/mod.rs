//! The system interface: everything the Setup asks of the OS goes through `System`,
//! so the logic runs on any platform against `MockSystem`.

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub mod mock;
#[cfg(windows)]
pub mod windows;

pub use mock::MockSystem;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallState {
    pub dir: PathBuf,
    pub version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOutcome {
    Exited(i32),
    TimedOut,
}

pub trait System: Send + Sync {
    fn install_state(&self) -> io::Result<Option<InstallState>>;
    fn app_data(&self) -> PathBuf;
    fn local_app_data(&self) -> PathBuf;
    fn temp_dir(&self) -> PathBuf;
    fn desktop_dir(&self) -> PathBuf;
    fn programs_dir(&self) -> PathBuf;
    fn free_space(&self, path: &Path) -> io::Result<u64>;
    fn is_network_path(&self, path: &Path) -> bool;
    fn can_write(&self, dir: &Path) -> io::Result<bool>;
    fn is_running(&self, exe: &Path) -> io::Result<bool>;
    fn is_elevated(&self) -> bool;
    fn has_webview2(&self) -> bool;
    /// Runs `program` with `raw_args` written verbatim (no quoting), waits up to `timeout`,
    /// and kills the process on timeout.
    fn run_and_wait(
        &self,
        program: &Path,
        raw_args: &str,
        env: &[(OsString, OsString)],
        timeout: Duration,
    ) -> io::Result<RunOutcome>;
    fn shortcut_target(&self, lnk: &Path) -> io::Result<Option<PathBuf>>;
    fn autostart_enable(&self, exe: &Path) -> io::Result<()>;
    fn autostart_disable(&self) -> io::Result<()>;
    fn autostart_is_enabled(&self) -> io::Result<bool>;
    fn delete_credentials_with_suffix(&self, suffix: &str) -> io::Result<usize>;
    fn delete_registry_tree(&self, hkcu_key: &str) -> io::Result<()>;
    fn delete_registry_key_if_empty(&self, hkcu_key: &str) -> io::Result<()>;
    /// Moves the running executable out of `dir` so the folder can be removed.
    fn self_delete_outside(&self, dir: &Path) -> io::Result<()>;
}

/// The system on platforms the Setup does not run on: everything fails with `Unsupported`.
pub struct UnsupportedSystem;

fn unsupported<T>() -> io::Result<T> {
    Err(io::Error::from(io::ErrorKind::Unsupported))
}

impl System for UnsupportedSystem {
    fn install_state(&self) -> io::Result<Option<InstallState>> { unsupported() }
    fn app_data(&self) -> PathBuf { PathBuf::new() }
    fn local_app_data(&self) -> PathBuf { PathBuf::new() }
    fn temp_dir(&self) -> PathBuf { std::env::temp_dir() }
    fn desktop_dir(&self) -> PathBuf { PathBuf::new() }
    fn programs_dir(&self) -> PathBuf { PathBuf::new() }
    fn free_space(&self, _: &Path) -> io::Result<u64> { unsupported() }
    fn is_network_path(&self, _: &Path) -> bool { false }
    fn can_write(&self, _: &Path) -> io::Result<bool> { unsupported() }
    fn is_running(&self, _: &Path) -> io::Result<bool> { unsupported() }
    fn is_elevated(&self) -> bool { false }
    fn has_webview2(&self) -> bool { false }
    fn run_and_wait(&self, _: &Path, _: &str, _: &[(OsString, OsString)], _: Duration) -> io::Result<RunOutcome> { unsupported() }
    fn shortcut_target(&self, _: &Path) -> io::Result<Option<PathBuf>> { unsupported() }
    fn autostart_enable(&self, _: &Path) -> io::Result<()> { unsupported() }
    fn autostart_disable(&self) -> io::Result<()> { unsupported() }
    fn autostart_is_enabled(&self) -> io::Result<bool> { unsupported() }
    fn delete_credentials_with_suffix(&self, _: &str) -> io::Result<usize> { unsupported() }
    fn delete_registry_tree(&self, _: &str) -> io::Result<()> { unsupported() }
    fn delete_registry_key_if_empty(&self, _: &str) -> io::Result<()> { unsupported() }
    fn self_delete_outside(&self, _: &Path) -> io::Result<()> { unsupported() }
}

/// The real system: Windows, or an `Unsupported` one elsewhere.
pub fn platform() -> Box<dyn System> {
    #[cfg(windows)]
    {
        windows::platform()
    }
    #[cfg(not(windows))]
    {
        Box::new(UnsupportedSystem)
    }
}
