//! Windows implementation of `System`.

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::sys::{InstallState, RunOutcome, System};

mod credentials;
mod disk;
mod folders;
mod process;
pub mod registry;
mod run;
mod shortcut;
mod wide;

/// The real system. `registry_root` is a prefix put in front of every `HKCU` path so tests
/// can work on a scratch key instead of the real ones.
pub struct WindowsSystem {
    registry_root: String,
}

impl WindowsSystem {
    pub fn new() -> Self {
        WindowsSystem { registry_root: String::new() }
    }

    /// For tests: every `HKCU` path becomes `<root>\<path>`.
    pub fn with_registry_root(root: &str) -> Self {
        WindowsSystem { registry_root: root.trim_matches('\\').to_string() }
    }
}

impl Default for WindowsSystem {
    fn default() -> Self {
        Self::new()
    }
}

pub fn platform() -> Box<dyn System> {
    Box::new(WindowsSystem::new())
}

impl System for WindowsSystem {
    fn install_state(&self) -> io::Result<Option<InstallState>> {
        registry::install_state(&self.registry_root)
    }
    fn app_data(&self) -> PathBuf {
        folders::app_data()
    }
    fn local_app_data(&self) -> PathBuf {
        folders::local_app_data()
    }
    fn temp_dir(&self) -> PathBuf {
        folders::temp_dir()
    }
    fn desktop_dir(&self) -> PathBuf {
        folders::desktop_dir()
    }
    fn programs_dir(&self) -> PathBuf {
        folders::programs_dir()
    }
    fn free_space(&self, path: &Path) -> io::Result<u64> {
        disk::free_space(path)
    }
    fn is_network_path(&self, path: &Path) -> bool {
        disk::is_network_path(path)
    }
    fn can_write(&self, dir: &Path) -> io::Result<bool> {
        disk::can_write(dir)
    }
    fn is_running(&self, exe: &Path) -> io::Result<bool> {
        process::is_running(exe)
    }
    fn is_elevated(&self) -> bool {
        process::is_elevated()
    }
    fn has_webview2(&self) -> bool {
        registry::has_webview2()
    }
    fn run_and_wait(
        &self,
        program: &Path,
        raw_args: &str,
        env: &[(OsString, OsString)],
        timeout: Duration,
    ) -> io::Result<RunOutcome> {
        run::run_and_wait(program, raw_args, env, timeout)
    }
    fn shortcut_target(&self, lnk: &Path) -> io::Result<Option<PathBuf>> {
        shortcut::shortcut_target(lnk)
    }
    fn autostart_enable(&self, exe: &Path) -> io::Result<()> {
        registry::autostart_enable(&self.registry_root, exe)
    }
    fn autostart_disable(&self) -> io::Result<()> {
        registry::autostart_disable(&self.registry_root)
    }
    fn autostart_is_enabled(&self) -> io::Result<bool> {
        registry::autostart_is_enabled(&self.registry_root)
    }
    fn delete_credentials_with_suffix(&self, suffix: &str) -> io::Result<usize> {
        credentials::delete_with_suffix(suffix)
    }
    fn delete_registry_tree(&self, hkcu_key: &str) -> io::Result<()> {
        registry::delete_tree(&self.registry_root, hkcu_key)
    }
    fn delete_registry_key_if_empty(&self, hkcu_key: &str) -> io::Result<()> {
        registry::delete_key_if_empty(&self.registry_root, hkcu_key)
    }
    fn self_delete_outside(&self, dir: &Path) -> io::Result<()> {
        self_replace::self_delete_outside_path(dir)
    }
}
