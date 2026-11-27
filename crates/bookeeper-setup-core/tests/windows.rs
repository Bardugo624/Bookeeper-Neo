#![cfg(windows)]
//! Windows system tests. They only touch scratch keys under
//! `HKCU\Software\BookeeperTest\<id>`, never the real ones.

use std::ffi::OsString;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bookeeper_setup_core::sys::windows::{registry, WindowsSystem};
use bookeeper_setup_core::sys::{RunOutcome, System};
use winreg::enums::*;
use winreg::{RegKey, RegValue};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn unique() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{}-{}-{}", std::process::id(), nanos, COUNTER.fetch_add(1, Ordering::SeqCst))
}

/// A system on a scratch registry root, removed on drop.
struct Scratch {
    root: String,
    sys: WindowsSystem,
}

impl Scratch {
    fn new() -> Self {
        let root = format!(r"Software\BookeeperTest\{}", unique());
        let sys = WindowsSystem::with_registry_root(&root);
        Scratch { root, sys }
    }
    fn key(&self, path: &str) -> String {
        format!(r"{}\{}", self.root, path)
    }
    fn hkcu() -> RegKey {
        RegKey::predef(HKEY_CURRENT_USER)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = Scratch::hkcu().delete_subkey_all(&self.root);
    }
}

#[test]
fn autostart_round_trip() {
    let s = Scratch::new();
    assert!(!s.sys.autostart_is_enabled().unwrap());
    s.sys.autostart_enable(Path::new(r"C:\Program Files\Bookeeper\bookeeper-desktop.exe")).unwrap();
    assert!(s.sys.autostart_is_enabled().unwrap());

    let run = Scratch::hkcu().open_subkey(s.key(registry::RUN_KEY)).unwrap();
    let cmd: String = run.get_value("Bookeeper").unwrap();
    assert_eq!(cmd, r#""C:\Program Files\Bookeeper\bookeeper-desktop.exe" --autostart"#);
    let approved = Scratch::hkcu().open_subkey(s.key(registry::APPROVED_KEY)).unwrap();
    assert_eq!(approved.get_raw_value("Bookeeper").unwrap().bytes.as_ref(), &[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    s.sys.autostart_disable().unwrap();
    assert!(!s.sys.autostart_is_enabled().unwrap());
    s.sys.autostart_disable().unwrap(); // already gone: still fine
}

#[test]
fn autostart_disabled_by_task_manager_reads_off() {
    let s = Scratch::new();
    s.sys.autostart_enable(Path::new(r"C:\x\bookeeper-desktop.exe")).unwrap();
    let approved = Scratch::hkcu()
        .open_subkey_with_flags(s.key(registry::APPROVED_KEY), KEY_SET_VALUE)
        .unwrap();
    let mut bytes = vec![0u8; 12];
    bytes[0] = 3;
    approved
        .set_raw_value("Bookeeper", &RegValue { bytes: std::borrow::Cow::Owned(bytes), vtype: REG_BINARY })
        .unwrap();
    assert!(!s.sys.autostart_is_enabled().unwrap());
}

#[test]
fn install_state_strips_quotes() {
    let s = Scratch::new();
    assert_eq!(s.sys.install_state().unwrap(), None);

    let (u, _) = Scratch::hkcu().create_subkey(s.key(registry::UNINSTALL_KEY)).unwrap();
    u.set_value("InstallLocation", &r#""C:\Users\Mario Rossi\Bookeeper""#).unwrap();
    u.set_value("DisplayVersion", &"2.2.0").unwrap();
    let state = s.sys.install_state().unwrap().unwrap();
    assert_eq!(state.dir, Path::new(r"C:\Users\Mario Rossi\Bookeeper"));
    assert_eq!(state.version, "2.2.0");

    // The default value of our own key wins and has no quotes.
    let (own, _) = Scratch::hkcu().create_subkey(s.key(registry::INSTALL_KEY)).unwrap();
    own.set_value("", &r"C:\Other\Bookeeper").unwrap();
    assert_eq!(s.sys.install_state().unwrap().unwrap().dir, Path::new(r"C:\Other\Bookeeper"));

    // Relative and network paths are refused.
    own.set_value("", &r"Bookeeper").unwrap();
    u.set_value("InstallLocation", &r#""\\server\share\Bookeeper""#).unwrap();
    assert_eq!(s.sys.install_state().unwrap(), None);
}

#[test]
fn delete_registry_helpers() {
    let s = Scratch::new();
    let (k, _) = Scratch::hkcu().create_subkey(s.key(r"A\B")).unwrap();
    k.set_value("v", &"1").unwrap();
    s.sys.delete_registry_key_if_empty(r"A").unwrap(); // has a subkey: kept
    s.sys.delete_registry_key_if_empty(r"A\B").unwrap(); // has a value: kept
    assert!(Scratch::hkcu().open_subkey(s.key(r"A\B")).is_ok());
    k.delete_value("v").unwrap();
    s.sys.delete_registry_key_if_empty(r"A\B").unwrap();
    assert!(Scratch::hkcu().open_subkey(s.key(r"A\B")).is_err());
    s.sys.delete_registry_tree("A").unwrap();
    s.sys.delete_registry_tree("A").unwrap(); // missing: fine
    assert!(Scratch::hkcu().open_subkey(s.key("A")).is_err());
}

#[test]
fn credentials_with_suffix_are_deleted() {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }
    fn write(name: &str) {
        let mut target = wide(name);
        let mut blob = *b"secret";
        let mut cred: CREDENTIALW = unsafe { std::mem::zeroed() };
        cred.Type = CRED_TYPE_GENERIC;
        cred.TargetName = target.as_mut_ptr();
        cred.CredentialBlobSize = blob.len() as u32;
        cred.CredentialBlob = blob.as_mut_ptr();
        cred.Persist = CRED_PERSIST_LOCAL_MACHINE;
        assert_ne!(unsafe { CredWriteW(&cred, 0) }, 0, "{}", std::io::Error::last_os_error());
    }
    fn exists(name: &str) -> bool {
        let target = wide(name);
        let mut out = std::ptr::null_mut();
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut out) };
        if ok != 0 {
            unsafe { windows_sys::Win32::Security::Credentials::CredFree(out as *const _) };
        }
        ok != 0
    }

    let id = unique();
    // Suffix unique to this run: never touches the real app's credentials.
    let suffix = format!(".{id}.bookeeper-test");
    let a = format!("key-a{suffix}");
    let b = format!("KEY-B{}", suffix.to_uppercase());
    let keep = format!("key-c-{id}.other.app");
    for n in [&a, &b, &keep] {
        write(n);
    }
    let s = Scratch::new();
    let n = s.sys.delete_credentials_with_suffix(&suffix).unwrap();
    assert_eq!(n, 2);
    assert!(!exists(&a));
    assert!(!exists(&b));
    assert!(exists(&keep));
    unsafe { CredDeleteW(wide(&keep).as_ptr(), CRED_TYPE_GENERIC, 0) };
}

#[test]
fn run_and_wait_passes_raw_args() {
    let s = Scratch::new();
    let dir = tempfile::tempdir().unwrap();
    let spaced = dir.path().join("with space");
    std::fs::create_dir(&spaced).unwrap();
    let out = spaced.join("out.txt");
    let cmd = std::env::var_os("ComSpec").map(std::path::PathBuf::from).unwrap_or_else(|| r"C:\Windows\System32\cmd.exe".into());
    let raw = format!(r#"/c echo %BK_TEST% > "{}""#, out.display());
    let env = [(OsString::from("BK_TEST"), OsString::from("raw-ok"))];
    let r = s.sys.run_and_wait(&cmd, &raw, &env, Duration::from_secs(30)).unwrap();
    assert_eq!(r, RunOutcome::Exited(0));
    assert!(std::fs::read_to_string(&out).unwrap().contains("raw-ok"));

    let slow = s.sys.run_and_wait(&cmd, "/c ping -n 30 127.0.0.1 > nul", &[], Duration::from_millis(300)).unwrap();
    assert_eq!(slow, RunOutcome::TimedOut);
}

#[test]
fn is_network_path_for_unc() {
    let s = Scratch::new();
    assert!(s.sys.is_network_path(Path::new(r"\\server\share\Bookeeper")));
    assert!(s.sys.is_network_path(Path::new(r"\\?\UNC\server\share")));
    assert!(!s.sys.is_network_path(Path::new(r"relative\path")));
}

#[test]
fn free_space_of_system_drive_is_positive() {
    let s = Scratch::new();
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    assert!(s.sys.free_space(Path::new(&format!(r"{drive}\"))).unwrap() > 0);
    // A folder that does not exist yet reports its drive.
    assert!(s.sys.free_space(Path::new(&format!(r"{drive}\bk-nonexistent-{}", unique()))).unwrap() > 0);
}

#[test]
fn can_write_cleans_up_what_it_created() {
    let s = Scratch::new();
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("a").join("b");
    assert!(s.sys.can_write(&target).unwrap());
    assert!(!dir.path().join("a").exists());
    assert!(s.sys.can_write(dir.path()).unwrap());
}

#[test]
fn folders_and_elevation_answer() {
    let s = Scratch::new();
    assert!(s.sys.app_data().is_absolute());
    assert!(s.sys.local_app_data().is_absolute());
    assert!(s.sys.desktop_dir().is_absolute());
    assert!(s.sys.programs_dir().is_absolute());
    assert!(s.sys.temp_dir().is_dir());
    let _ = s.sys.is_elevated();
    let _ = s.sys.has_webview2();
    let me = std::env::current_exe().unwrap();
    assert!(s.sys.is_running(&me).unwrap());
    assert_eq!(s.sys.shortcut_target(Path::new(r"C:\nope\missing.lnk")).unwrap(), None);
}
