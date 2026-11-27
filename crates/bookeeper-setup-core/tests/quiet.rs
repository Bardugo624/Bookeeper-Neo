use bookeeper_setup_core::cmdline::{Invocation, QuietInstallArgs, UninstallArgs};
use bookeeper_setup_core::payload::{encode_tail, FileMeta, Meta};
use bookeeper_setup_core::quiet;
use bookeeper_setup_core::sys::{InstallState, MockSystem, RunOutcome, System};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MAIN: &[u8] = b"the real bookeeper-desktop executable, long enough to matter";

// The elevated override is a process-wide variable: tests that touch it run one at a time.
static ENV: Mutex<()> = Mutex::new(());

fn hex(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|x| format!("{x:02x}"))
        .collect()
}

struct Fixture {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    sys: Arc<MockSystem>,
    setup: PathBuf,
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    let sys = Arc::new(MockSystem::new(&root));
    let installer = b"fake NSIS installer bytes".repeat(20);
    let meta = Meta {
        version: "2.2.0".into(),
        payload: FileMeta {
            name: "Bookeeper_2.2.0_x64-setup.exe".into(),
            bytes: installer.len() as u64,
            sha256: hex(&installer),
        },
        main: FileMeta {
            name: "bookeeper-desktop.exe".into(),
            bytes: MAIN.len() as u64,
            sha256: hex(MAIN),
        },
        installed_bytes: 5 * 1024 * 1024,
    };
    let mut bytes = b"MZ light setup".to_vec();
    bytes.extend_from_slice(&installer);
    bytes.extend_from_slice(&encode_tail(&meta, installer.len() as u64));
    let setup = root.join("Setup.exe");
    std::fs::write(&setup, bytes).unwrap();
    sys.on_run(|rec| {
        let dir = PathBuf::from(
            rec.raw_args
                .split("/D=")
                .nth(1)
                .or_else(|| rec.raw_args.split("_?=").nth(1))
                .unwrap(),
        );
        if rec.raw_args.contains("_?=") {
            let _ = std::fs::remove_file(dir.join("bookeeper-desktop.exe"));
        } else {
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("bookeeper-desktop.exe"), MAIN).unwrap();
            std::fs::write(dir.join("uninstall.exe"), b"u").unwrap();
        }
        RunOutcome::Exited(0)
    });
    Fixture {
        _tmp: tmp,
        root,
        sys,
        setup,
    }
}

fn install_args(dir: Option<&Path>) -> Invocation {
    Invocation::QuietInstall(QuietInstallArgs {
        dir: dir.map(Path::to_path_buf),
        desktop_icon: true,
        autostart: false,
    })
}

fn installed(f: &Fixture, version: &str) -> PathBuf {
    let dir = f.root.join("Installed");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("bookeeper-desktop.exe"), b"old").unwrap();
    std::fs::write(dir.join("uninstall.exe"), b"u").unwrap();
    *f.sys.installed.lock().unwrap() = Some(InstallState {
        dir: dir.clone(),
        version: version.into(),
    });
    dir
}

fn run(f: &Fixture, inv: &Invocation) -> i32 {
    quiet::run(&*f.sys, inv, &f.setup)
}

fn log_text(f: &Fixture) -> String {
    std::fs::read_to_string(f.sys.temp_dir().join("Bookeeper-Setup.log")).unwrap_or_default()
}

/// Exit code 2 without running NSIS, and the log names the folder problem.
fn assert_refused(f: &Fixture, dir: &Path, problem: &str) {
    assert_eq!(run(f, &install_args(Some(dir))), 2, "{}", dir.display());
    assert!(f.sys.runs.lock().unwrap().is_empty());
    assert!(
        log_text(f).contains(&format!("folder problem {problem}")),
        "{problem}: {}",
        log_text(f)
    );
}

#[test]
fn quiet_codes() {
    let _g = ENV.lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("BOOKEEPER_SETUP_ALLOW_ELEVATED");

    // Fresh install: 0, into the default folder.
    let f = fixture();
    assert_eq!(run(&f, &install_args(None)), 0);
    assert!(f
        .sys
        .local_app_data()
        .join("Bookeeper")
        .join("bookeeper-desktop.exe")
        .exists());

    // App open: 3.
    let f = fixture();
    *f.sys.running.lock().unwrap() = true;
    assert_eq!(run(&f, &install_args(None)), 3);

    // Newer installed, and 0.x: 4.
    let f = fixture();
    installed(&f, "2.3.0");
    assert_eq!(run(&f, &install_args(None)), 4);
    let f = fixture();
    installed(&f, "0.2.1");
    assert_eq!(run(&f, &install_args(None)), 4);

    // Same version repairs, older updates, in their own folder.
    let f = fixture();
    let dir = installed(&f, "2.2.0");
    assert_eq!(run(&f, &install_args(Some(&dir))), 0);
    assert_eq!(
        f.sys.runs.lock().unwrap()[0].raw_args,
        format!("/S /UPDATE /D={}", dir.display())
    );
    let f = fixture();
    let dir = installed(&f, "2.1.0");
    assert_eq!(run(&f, &install_args(None)), 0);
    assert_eq!(
        f.sys.runs.lock().unwrap()[0].raw_args,
        format!("/S /UPDATE /D={}", dir.display())
    );

    // A different --dir over an installation: 2, nothing run.
    let f = fixture();
    installed(&f, "2.1.0");
    assert_eq!(run(&f, &install_args(Some(&f.root.join("Elsewhere")))), 2);
    assert!(f.sys.runs.lock().unwrap().is_empty());

    // Administrator: 2, unless the override is set.
    let f = fixture();
    *f.sys.elevated.lock().unwrap() = true;
    assert_eq!(run(&f, &install_args(None)), 2);
    assert!(f.sys.runs.lock().unwrap().is_empty());
    std::env::set_var("BOOKEEPER_SETUP_ALLOW_ELEVATED", "1");
    assert_eq!(run(&f, &install_args(None)), 0);
    std::env::remove_var("BOOKEEPER_SETUP_ALLOW_ELEVATED");

    // A setup without installer, or a failing NSIS: 2.
    let f = fixture();
    std::fs::write(&f.setup, b"MZ").unwrap();
    assert_eq!(run(&f, &install_args(None)), 2);
    let f = fixture();
    f.sys.on_run(|_| RunOutcome::Exited(1));
    assert_eq!(run(&f, &install_args(None)), 2);
}

#[test]
fn quiet_install_checks_the_folder_like_the_window() {
    let _g = ENV.lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("BOOKEEPER_SETUP_ALLOW_ELEVATED");
    const MB: u64 = 1024 * 1024;

    let f = fixture();
    assert_refused(&f, Path::new("Bookeeper"), "NotAbsolute");
    let f = fixture();
    assert_refused(&f, Path::new(r"relative\Bookeeper"), "NotAbsolute");

    let f = fixture();
    let share = f.root.join("Share");
    f.sys.network_prefixes.lock().unwrap().push(share.clone());
    assert_refused(&f, &share.join("Bookeeper"), "Network");
    let f = fixture();
    assert_refused(&f, Path::new(r"\\server\share\Bookeeper"), "Network");

    let f = fixture();
    assert_refused(&f, &f.root.join("a".repeat(250)), "TooLong");

    let f = fixture();
    let apps = f.root.join("Apps");
    std::fs::create_dir_all(&apps).unwrap();
    f.sys.unwritable_prefixes.lock().unwrap().push(apps.clone());
    assert_refused(&f, &apps.join("Bookeeper"), "NeedsAdmin");

    // The fixture needs 5 MB plus the 50 MB margin on the target disk.
    let f = fixture();
    let apps = f.root.join("Apps");
    std::fs::create_dir_all(&apps).unwrap();
    f.sys
        .free_by_prefix
        .lock()
        .unwrap()
        .push((apps.clone(), 54 * MB));
    assert_refused(&f, &apps.join("Bookeeper"), "TooLittleSpace");

    // %TEMP% must hold the installer (500 bytes here).
    let f = fixture();
    let temp = f.sys.temp_dir();
    f.sys.free_by_prefix.lock().unwrap().push((temp, 499));
    assert_refused(&f, &f.root.join("Bookeeper"), "TempTooSmall");
}

#[test]
fn quiet_passive_uninstall_keeps_data() {
    let _g = ENV.lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("BOOKEEPER_SETUP_ALLOW_ELEVATED");
    let f = fixture();
    let dir = installed(&f, "2.1.0");
    let data = f.sys.app_data().join("org.bookeeper.desktop");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(data.join("bookeeper.sqlite"), b"db").unwrap();
    *f.sys.credentials.lock().unwrap() = vec!["t.org.bookeeper.desktop".into()];

    let passive = Invocation::Uninstall(UninstallArgs {
        passive: true,
        quiet: false,
        delete_data: false,
        dir: Some(dir.clone()),
    });
    assert_eq!(run(&f, &passive), 0);
    assert!(!dir.join("bookeeper-desktop.exe").exists());
    assert!(data.join("bookeeper.sqlite").exists());
    assert_eq!(f.sys.credentials.lock().unwrap().len(), 1);
    // One process only: the passive uninstall does not relaunch itself.
    assert_eq!(f.sys.runs.lock().unwrap().len(), 1);
    assert_eq!(
        f.sys.runs.lock().unwrap()[0].raw_args,
        format!("/S _?={}", dir.display())
    );
}

#[test]
fn quiet_uninstall_delete_data_and_codes() {
    let _g = ENV.lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("BOOKEEPER_SETUP_ALLOW_ELEVATED");
    let f = fixture();
    let dir = installed(&f, "2.1.0");
    let data = f.sys.app_data().join("org.bookeeper.desktop");
    std::fs::create_dir_all(&data).unwrap();
    *f.sys.credentials.lock().unwrap() = vec!["t.org.bookeeper.desktop".into()];
    let inv = Invocation::Uninstall(UninstallArgs {
        passive: false,
        quiet: true,
        delete_data: true,
        dir: None,
    });
    *f.sys.running.lock().unwrap() = true;
    assert_eq!(run(&f, &inv), 3);
    *f.sys.running.lock().unwrap() = false;
    assert_eq!(run(&f, &inv), 0);
    assert!(!data.exists() && !dir.join("bookeeper-desktop.exe").exists());
    assert!(f.sys.credentials.lock().unwrap().is_empty());

    // Not installed and no folder: 2.
    let f = fixture();
    let inv = Invocation::Uninstall(UninstallArgs {
        passive: false,
        quiet: true,
        delete_data: false,
        dir: None,
    });
    assert_eq!(run(&f, &inv), 2);
}
