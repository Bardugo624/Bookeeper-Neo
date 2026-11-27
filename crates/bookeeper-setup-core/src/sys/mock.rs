//! An in-memory `System` for tests on every platform. Folders are real, under a root
//! the test owns; registry, credentials, autostart and launched programs are state
//! the test can read and set.

use super::{InstallState, RunOutcome, System};
use std::collections::{BTreeSet, HashMap};
use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunRecord {
    pub program: PathBuf,
    pub raw_args: String,
    pub env: Vec<(OsString, OsString)>,
}

type RunCallback = Box<dyn Fn(&RunRecord) -> RunOutcome + Send + Sync>;

pub struct MockSystem {
    pub app_data: PathBuf,
    pub local_app_data: PathBuf,
    pub temp: PathBuf,
    pub desktop: PathBuf,
    pub programs: PathBuf,

    /// What the registry says about the installed app.
    pub installed: Mutex<Option<InstallState>>,
    /// The executable registered to open at login, if any.
    pub autostart: Mutex<Option<PathBuf>>,
    pub credentials: Mutex<Vec<String>>,
    /// HKCU keys that exist, as full paths below HKCU (`Software\bookeeper\Bookeeper`).
    pub registry_keys: Mutex<BTreeSet<String>>,
    /// Every program started through `run_and_wait`, in order.
    pub runs: Mutex<Vec<RunRecord>>,
    /// Folders passed to `self_delete_outside`.
    pub self_deleted: Mutex<Vec<PathBuf>>,
    pub shortcuts: Mutex<HashMap<PathBuf, PathBuf>>,

    pub running: Mutex<bool>,
    pub elevated: Mutex<bool>,
    pub webview2: Mutex<bool>,
    /// Free space per path prefix (longest prefix wins); `default_free` otherwise.
    pub free_by_prefix: Mutex<Vec<(PathBuf, u64)>>,
    pub default_free: Mutex<u64>,
    pub network_prefixes: Mutex<Vec<PathBuf>>,
    pub unwritable_prefixes: Mutex<Vec<PathBuf>>,
    on_run: Mutex<Option<RunCallback>>,
}

impl MockSystem {
    /// Creates the data, temp, desktop and programs folders under `root`.
    pub fn new(root: &Path) -> Self {
        let dir = |n: &str| {
            let p = root.join(n);
            std::fs::create_dir_all(&p).expect("mock folder");
            p
        };
        Self {
            app_data: dir("AppData"),
            local_app_data: dir("LocalAppData"),
            temp: dir("Temp"),
            desktop: dir("Desktop"),
            programs: dir("Programs"),
            installed: Mutex::new(None),
            autostart: Mutex::new(None),
            credentials: Mutex::new(vec![]),
            registry_keys: Mutex::new(BTreeSet::new()),
            runs: Mutex::new(vec![]),
            self_deleted: Mutex::new(vec![]),
            shortcuts: Mutex::new(HashMap::new()),
            running: Mutex::new(false),
            elevated: Mutex::new(false),
            webview2: Mutex::new(true),
            free_by_prefix: Mutex::new(vec![]),
            default_free: Mutex::new(100 * 1024 * 1024 * 1024),
            network_prefixes: Mutex::new(vec![]),
            unwritable_prefixes: Mutex::new(vec![]),
            on_run: Mutex::new(None),
        }
    }

    /// Simulates the program launched by `run_and_wait` (NSIS): the callback may write
    /// files and returns how it ended. Without one, programs exit with 0.
    pub fn on_run(&self, callback: impl Fn(&RunRecord) -> RunOutcome + Send + Sync + 'static) {
        *self.on_run.lock().unwrap() = Some(Box::new(callback));
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl System for MockSystem {
    fn install_state(&self) -> io::Result<Option<InstallState>> {
        Ok(lock(&self.installed).clone())
    }
    fn app_data(&self) -> PathBuf { self.app_data.clone() }
    fn local_app_data(&self) -> PathBuf { self.local_app_data.clone() }
    fn temp_dir(&self) -> PathBuf { self.temp.clone() }
    fn desktop_dir(&self) -> PathBuf { self.desktop.clone() }
    fn programs_dir(&self) -> PathBuf { self.programs.clone() }

    fn free_space(&self, path: &Path) -> io::Result<u64> {
        let best = lock(&self.free_by_prefix)
            .iter()
            .filter(|(p, _)| path.starts_with(p))
            .max_by_key(|(p, _)| p.components().count())
            .map(|(_, n)| *n);
        Ok(best.unwrap_or_else(|| *lock(&self.default_free)))
    }
    fn is_network_path(&self, path: &Path) -> bool {
        lock(&self.network_prefixes).iter().any(|p| path.starts_with(p))
    }
    fn can_write(&self, dir: &Path) -> io::Result<bool> {
        Ok(!lock(&self.unwritable_prefixes).iter().any(|p| dir.starts_with(p)))
    }
    fn is_running(&self, _exe: &Path) -> io::Result<bool> { Ok(*lock(&self.running)) }
    fn is_elevated(&self) -> bool { *lock(&self.elevated) }
    fn has_webview2(&self) -> bool { *lock(&self.webview2) }

    fn run_and_wait(
        &self,
        program: &Path,
        raw_args: &str,
        env: &[(OsString, OsString)],
        _timeout: Duration,
    ) -> io::Result<RunOutcome> {
        let rec = RunRecord { program: program.to_path_buf(), raw_args: raw_args.to_string(), env: env.to_vec() };
        lock(&self.runs).push(rec.clone());
        let outcome = lock(&self.on_run).as_ref().map_or(RunOutcome::Exited(0), |cb| cb(&rec));
        Ok(outcome)
    }

    fn shortcut_target(&self, lnk: &Path) -> io::Result<Option<PathBuf>> {
        Ok(lock(&self.shortcuts).get(lnk).cloned())
    }
    fn autostart_enable(&self, exe: &Path) -> io::Result<()> {
        *lock(&self.autostart) = Some(exe.to_path_buf());
        Ok(())
    }
    fn autostart_disable(&self) -> io::Result<()> {
        *lock(&self.autostart) = None;
        Ok(())
    }
    fn autostart_is_enabled(&self) -> io::Result<bool> { Ok(lock(&self.autostart).is_some()) }

    fn delete_credentials_with_suffix(&self, suffix: &str) -> io::Result<usize> {
        let mut c = lock(&self.credentials);
        let before = c.len();
        c.retain(|n| !n.ends_with(suffix));
        Ok(before - c.len())
    }
    fn delete_registry_tree(&self, key: &str) -> io::Result<()> {
        let sub = format!("{key}\\");
        lock(&self.registry_keys).retain(|k| k != key && !k.starts_with(&sub));
        Ok(())
    }
    fn delete_registry_key_if_empty(&self, key: &str) -> io::Result<()> {
        let sub = format!("{key}\\");
        let mut keys = lock(&self.registry_keys);
        if !keys.iter().any(|k| k.starts_with(&sub)) {
            keys.remove(key);
        }
        Ok(())
    }
    fn self_delete_outside(&self, dir: &Path) -> io::Result<()> {
        lock(&self.self_deleted).push(dir.to_path_buf());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn mock_system_records_runs_and_registry() {
        let tmp = tempfile::tempdir().unwrap();
        let sys = Arc::new(MockSystem::new(tmp.path()));
        let target = tmp.path().join("Install");
        let t2 = target.clone();
        sys.on_run(move |rec| {
            std::fs::create_dir_all(&t2).unwrap();
            std::fs::write(t2.join("bookeeper-desktop.exe"), rec.raw_args.as_bytes()).unwrap();
            RunOutcome::Exited(0)
        });
        let out = sys
            .run_and_wait(Path::new("installer.exe"), "/S /D=C:\\a b", &[(OsString::from("TEMP"), OsString::from("x"))], Duration::from_secs(1))
            .unwrap();
        assert_eq!(out, RunOutcome::Exited(0));
        assert_eq!(lock(&sys.runs).len(), 1);
        assert_eq!(lock(&sys.runs)[0].raw_args, "/S /D=C:\\a b");
        assert!(target.join("bookeeper-desktop.exe").exists());

        {
            let mut k = lock(&sys.registry_keys);
            k.insert(r"Software\bookeeper".into());
            k.insert(r"Software\bookeeper\Bookeeper".into());
        }
        sys.delete_registry_key_if_empty(r"Software\bookeeper").unwrap();
        assert!(lock(&sys.registry_keys).contains(r"Software\bookeeper"));
        sys.delete_registry_tree(r"Software\bookeeper\Bookeeper").unwrap();
        sys.delete_registry_key_if_empty(r"Software\bookeeper").unwrap();
        assert!(lock(&sys.registry_keys).is_empty());

        *lock(&sys.credentials) = vec!["token.org.bookeeper.desktop".into(), "other.app".into(), "x.org.bookeeper.desktop".into()];
        assert_eq!(sys.delete_credentials_with_suffix(".org.bookeeper.desktop").unwrap(), 2);
        assert_eq!(*lock(&sys.credentials), vec!["other.app".to_string()]);

        assert!(!sys.autostart_is_enabled().unwrap());
        sys.autostart_enable(Path::new("a.exe")).unwrap();
        assert!(sys.autostart_is_enabled().unwrap());
        sys.autostart_disable().unwrap();
        assert!(!sys.autostart_is_enabled().unwrap());
    }

    #[test]
    fn unsupported_platform_says_unsupported() {
        #[cfg(not(windows))]
        {
            let s = crate::sys::platform();
            assert_eq!(s.install_state().unwrap_err().kind(), io::ErrorKind::Unsupported);
        }
    }
}
