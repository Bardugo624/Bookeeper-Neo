use bookeeper_setup_core::cmdline::{parse_invocation, Invocation};
use bookeeper_setup_core::ops::OpError;
use bookeeper_setup_core::payload::{encode_tail, FileMeta, Meta};
use bookeeper_setup_core::progress::{Snapshot, Step};
use bookeeper_setup_core::sys::{InstallState, MockSystem};
use bookeeper_setup_lib::commands::{
    build_info, check_target, extract_installer, uninstall_dir, Blocked, Context, ErrorCode,
    OpResult, ProblemCode, ProgressEvent, SetupMode, EXTRACT_PREFIX,
};
use bookeeper_setup_lib::window::{stale_dirs, sweep_stale, WEBVIEW_PREFIX};
use bookeeper_setup_lib::{route, Route};
use sha2::{Digest, Sha256};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const MB: u64 = 1024 * 1024;

struct Fixture {
    _tmp: tempfile::TempDir,
    sys: MockSystem,
    root: PathBuf,
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    let sys = MockSystem::new(&root);
    Fixture {
        _tmp: tmp,
        sys,
        root,
    }
}

fn meta(payload_len: u64) -> Meta {
    Meta {
        version: "2.2.0".into(),
        payload: FileMeta {
            name: "Bookeeper_2.2.0_x64-setup.exe".into(),
            bytes: payload_len,
            sha256: "00".repeat(32),
        },
        main: FileMeta {
            name: "bookeeper-desktop.exe".into(),
            bytes: 10,
            sha256: "11".repeat(32),
        },
        installed_bytes: 120 * MB,
    }
}

/// A Setup file: some program bytes, the installer, then the tail.
fn full_setup(dir: &Path) -> PathBuf {
    let exe = dir.join("Bookeeper-Setup-2.2.0.exe");
    let payload = vec![7u8; 64];
    let mut bytes = vec![1u8; 100];
    bytes.extend_from_slice(&payload);
    bytes.extend_from_slice(&encode_tail(
        &meta(payload.len() as u64),
        payload.len() as u64,
    ));
    std::fs::write(&exe, bytes).unwrap();
    exe
}

/// A full Setup carrying `installer`, whose metadata gives it the hash `sha256`.
fn setup_carrying(dir: &Path, installer: &[u8], sha256: &str) -> (PathBuf, Meta) {
    let mut m = meta(installer.len() as u64);
    m.payload.sha256 = sha256.into();
    let exe = dir.join("Bookeeper-Setup-2.2.0.exe");
    let mut bytes = vec![1u8; 100];
    bytes.extend_from_slice(installer);
    bytes.extend_from_slice(&encode_tail(&m, installer.len() as u64));
    std::fs::write(&exe, bytes).unwrap();
    (exe, m)
}

fn sha256_hex(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|x| format!("{x:02x}"))
        .collect()
}

fn light_setup(dir: &Path) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let exe = dir.join("bookeeper-setup.exe");
    std::fs::write(&exe, vec![1u8; 100]).unwrap();
    exe
}

fn install_app(f: &Fixture, version: &str) -> PathBuf {
    let dir = f.root.join("Apps").join("Bookeeper");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("bookeeper-desktop.exe"), b"app").unwrap();
    *f.sys.installed.lock().unwrap() = Some(InstallState {
        dir: dir.clone(),
        version: version.into(),
    });
    dir
}

fn ctx(exe: PathBuf, uninstall: bool) -> Context {
    Context {
        setup_exe: exe,
        uninstall_requested: uninstall,
        supported: true,
    }
}

#[test]
fn setup_info_install_mode_with_payload() {
    let f = fixture();
    let exe = full_setup(&f.root);
    let info = build_info(&f.sys, &ctx(exe, false));
    assert_eq!(info.mode, SetupMode::Install);
    assert_eq!(info.blocked, None);
    let p = info.payload.clone().expect("payload");
    assert_eq!((p.version.as_str(), p.installed_bytes), ("2.2.0", 120 * MB));
    assert!(info.installed.is_none());
    assert_eq!(
        PathBuf::from(&info.defaults.dir),
        f.sys.local_app_data.join("Bookeeper")
    );
    assert!(info.defaults.desktop_icon && !info.defaults.autostart);

    let json = serde_json::to_value(&info).unwrap();
    assert_eq!(json["payload"]["installedBytes"], 120 * MB);
    assert_eq!(json["defaults"]["desktopIcon"], true);
    assert_eq!(json["data"]["hasLibrary"], false);
    assert_eq!(json["blocked"], serde_json::Value::Null);
    assert_eq!(json["mode"], "install");
}

#[test]
fn setup_info_light_in_install_dir_is_uninstall() {
    let f = fixture();
    let dir = install_app(&f, "2.1.0");
    let exe = light_setup(&dir);
    let info = build_info(&f.sys, &ctx(exe, false));
    assert_eq!(info.mode, SetupMode::Uninstall);
    assert_eq!(info.blocked, None);
    assert!(info.payload.is_none());
    assert_eq!(info.installed.unwrap().version, "2.1.0");

    // With --uninstall it works from anywhere.
    let elsewhere = light_setup(&f.root.join("Downloads"));
    let info = build_info(&f.sys, &ctx(elsewhere, true));
    assert_eq!((info.mode, info.blocked), (SetupMode::Uninstall, None));
}

#[test]
fn setup_info_light_elsewhere_is_incomplete() {
    let f = fixture();
    install_app(&f, "2.1.0");
    let exe = light_setup(&f.root.join("Downloads"));
    let info = build_info(&f.sys, &ctx(exe, false));
    assert_eq!(info.mode, SetupMode::Install);
    assert_eq!(info.blocked, Some(Blocked::Incomplete));
    assert_eq!(
        serde_json::to_value(&info).unwrap()["blocked"],
        "incomplete"
    );
}

#[test]
fn setup_info_elevated_is_blocked() {
    let f = fixture();
    let exe = full_setup(&f.root);
    *f.sys.elevated.lock().unwrap() = true;
    assert_eq!(
        build_info(&f.sys, &ctx(exe.clone(), false)).blocked,
        Some(Blocked::Elevated)
    );

    *f.sys.elevated.lock().unwrap() = false;
    let unsupported = Context {
        setup_exe: exe,
        uninstall_requested: false,
        supported: false,
    };
    assert_eq!(
        build_info(&f.sys, &unsupported).blocked,
        Some(Blocked::Unsupported)
    );
}

#[test]
fn setup_info_marks_legacy() {
    let f = fixture();
    install_app(&f, "0.2.1");
    let exe = full_setup(&f.root);
    let info = build_info(&f.sys, &ctx(exe, false));
    let installed = info.installed.unwrap();
    assert!(installed.legacy);
    assert_eq!(installed.version, "0.2.1");
    assert_eq!(
        PathBuf::from(&info.defaults.dir),
        f.root.join("Apps").join("Bookeeper")
    );
}

#[test]
fn check_dir_appends_bookeeper_and_reports_space() {
    let f = fixture();
    let m = meta(64);
    let docs = r"C:\Users\Mario Rossi\Documenti";
    let target = r"C:\Users\Mario Rossi\Documenti\Bookeeper";

    let ok = check_target(&f.sys, docs, Some(&m));
    assert_eq!(ok.dir, target);
    assert_eq!(ok.problem, None);
    assert_eq!(ok.drive, "C:");
    assert_eq!(ok.free_bytes, 100 * 1024 * MB);
    // A folder already called Bookeeper is kept.
    assert_eq!(check_target(&f.sys, target, Some(&m)).dir, target);

    // Too little room on the target disk.
    f.sys
        .free_by_prefix
        .lock()
        .unwrap()
        .push((PathBuf::from(target), 100 * MB));
    let low = check_target(&f.sys, docs, Some(&m));
    assert_eq!(
        (low.problem, low.free_bytes),
        (Some(ProblemCode::TooLittleSpace), 100 * MB)
    );
    assert_eq!(
        serde_json::to_value(&low).unwrap()["problem"],
        "too_little_space"
    );
    f.sys.free_by_prefix.lock().unwrap().clear();

    // Too little room in %TEMP%.
    f.sys
        .free_by_prefix
        .lock()
        .unwrap()
        .push((f.sys.temp.clone(), 10));
    let temp = check_target(&f.sys, docs, Some(&m));
    assert_eq!(
        (temp.problem, temp.free_bytes),
        (Some(ProblemCode::TempTooSmall), 10)
    );
    f.sys.free_by_prefix.lock().unwrap().clear();

    f.sys
        .network_prefixes
        .lock()
        .unwrap()
        .push(PathBuf::from(target));
    assert_eq!(
        check_target(&f.sys, docs, Some(&m)).problem,
        Some(ProblemCode::Network)
    );
    f.sys.network_prefixes.lock().unwrap().clear();

    f.sys
        .unwritable_prefixes
        .lock()
        .unwrap()
        .push(PathBuf::from(target));
    let denied = check_target(&f.sys, docs, Some(&m));
    assert_eq!(denied.problem, Some(ProblemCode::NeedsAdmin));
    assert_eq!(
        serde_json::to_value(&denied).unwrap()["problem"],
        "needs_admin"
    );

    assert_eq!(
        check_target(&f.sys, "Documenti", Some(&m)).problem,
        Some(ProblemCode::NotAbsolute)
    );
    assert_eq!(
        check_target(&f.sys, r"\\server\share", Some(&m)).problem,
        Some(ProblemCode::Network)
    );
    let long = format!(r"C:\{}", "a".repeat(250));
    assert_eq!(
        check_target(&f.sys, &long, Some(&m)).problem,
        Some(ProblemCode::TooLong)
    );
    assert_eq!(check_target(&f.sys, r"D:\Libri", Some(&m)).drive, "D:");
}

#[test]
fn op_errors_map_to_results() {
    let json = |r: Result<(), OpError>| serde_json::to_value(OpResult::from(r)).unwrap();
    assert_eq!(json(Ok(())), serde_json::json!({ "ok": true }));
    let failed = |error: &str| serde_json::json!({ "ok": false, "error": error });
    assert_eq!(json(Err(OpError::AppRunning)), failed("app_running"));
    assert_eq!(json(Err(OpError::Payload("x".into()))), failed("payload"));
    assert_eq!(
        json(Err(OpError::NsisFailed { code: 5 })),
        serde_json::json!({ "ok": false, "error": "nsis_failed", "code": 5 })
    );
    assert_eq!(json(Err(OpError::TimedOut)), failed("timeout"));
    assert_eq!(
        json(Err(OpError::Verification("x".into()))),
        failed("verification")
    );
    assert_eq!(json(Err(OpError::Io("x".into()))), failed("io"));
    assert_eq!(OpResult::failed(ErrorCode::Io).code, None);

    let ev: ProgressEvent = Snapshot {
        step: Step::RemoveData,
        fraction: 0.5,
        done: false,
    }
    .into();
    assert_eq!(
        serde_json::to_value(ev).unwrap(),
        serde_json::json!({ "step": "removeData", "fraction": 0.5, "done": false })
    );
}

#[test]
fn invocation_routes_quiet_and_passive_to_quiet_run() {
    let r = |line: &str| route(&parse_invocation(line).unwrap());
    assert_eq!(
        r("setup.exe"),
        Route::Window {
            smoke: false,
            uninstall: false
        }
    );
    assert_eq!(
        r("setup.exe --smoke-ui"),
        Route::Window {
            smoke: true,
            uninstall: false
        }
    );
    assert_eq!(r("setup.exe --quiet"), Route::Quiet);
    assert_eq!(
        r("setup.exe --uninstall"),
        Route::Window {
            smoke: false,
            uninstall: true
        }
    );
    assert_eq!(r("setup.exe --uninstall --quiet"), Route::Quiet);
    assert_eq!(r("setup.exe --uninstall /P"), Route::Quiet);
    assert_eq!(
        r(r"setup.exe --uninstall /P _?=C:\Prova Bookeeper\Libreria è"),
        Route::Quiet
    );
    assert_eq!(r("setup.exe --uninstall /UPDATE"), Route::Quiet);
    assert!(parse_invocation("setup.exe --nope").is_err());
    assert!(matches!(
        parse_invocation("setup.exe").unwrap(),
        Invocation::Gui
    ));
}

#[test]
fn unregistered_folder_needs_the_app_and_its_uninstaller() {
    let f = fixture();
    // Another program's uninstaller next to the Setup is not an installation.
    let downloads = f.root.join("Downloads");
    let exe = light_setup(&downloads);
    std::fs::write(downloads.join("uninstall.exe"), b"u").unwrap();
    assert_eq!(uninstall_dir(&f.sys, &exe), None);
    std::fs::write(downloads.join("bookeeper-desktop.exe"), b"app").unwrap();
    assert_eq!(uninstall_dir(&f.sys, &exe), Some(downloads));

    let only_app = f.root.join("OnlyApp");
    let exe = light_setup(&only_app);
    std::fs::write(only_app.join("bookeeper-desktop.exe"), b"app").unwrap();
    assert_eq!(uninstall_dir(&f.sys, &exe), None);
}

#[test]
fn fallback_unpacks_the_installer_and_keeps_it_open_read_only() {
    let f = fixture();
    let installer = b"classic NSIS installer".repeat(50);
    let (exe, m) = setup_carrying(&f.root, &installer, &sha256_hex(&installer));

    let mut out = extract_installer(&f.sys, &exe, &m).unwrap();
    let dir = out.path.parent().unwrap();
    assert_eq!(dir.parent().unwrap(), f.sys.temp);
    assert!(dir
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with(EXTRACT_PREFIX));
    assert_eq!(
        out.path.file_name().unwrap(),
        "Bookeeper_2.2.0_x64-setup.exe"
    );
    assert_eq!(std::fs::read(&out.path).unwrap(), installer);

    // The handle is open on that file, for reading only.
    out.lock.seek(SeekFrom::Start(0)).unwrap();
    let mut seen = vec![];
    out.lock.read_to_end(&mut seen).unwrap();
    assert_eq!(seen, installer);
    assert!(out.lock.write_all(b"x").is_err());

    // While it is held, nobody else may write or delete the file.
    #[cfg(windows)]
    {
        let path = out.path.clone();
        assert!(std::fs::OpenOptions::new().write(true).open(&path).is_err());
        assert!(std::fs::remove_file(&path).is_err());
        drop(out);
        assert!(std::fs::OpenOptions::new().write(true).open(&path).is_ok());
    }
}

#[test]
fn fallback_refuses_an_installer_that_does_not_match() {
    let f = fixture();
    let installer = b"classic NSIS installer".repeat(50);
    let (exe, m) = setup_carrying(&f.root, &installer, &"00".repeat(32));
    let err = extract_installer(&f.sys, &exe, &m).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    // Its folder is gone too.
    assert_eq!(std::fs::read_dir(&f.sys.temp).unwrap().count(), 0);
}

#[test]
fn stale_classic_installer_folders_are_picked_by_prefix_and_age() {
    let tmp = tempfile::tempdir().unwrap();
    let temp = tmp.path();
    let folder = |name: String| {
        let p = temp.join(name);
        std::fs::create_dir_all(&p).unwrap();
        p
    };
    let a = folder(format!("{EXTRACT_PREFIX}1f2e-3d"));
    let b = folder(format!("{EXTRACT_PREFIX}4c5b-6a"));
    folder(format!("{WEBVIEW_PREFIX}7a"));
    folder("Bookeeper-Setup-0123456789abcdef".into());
    folder("other".into());
    std::fs::write(temp.join(format!("{EXTRACT_PREFIX}file")), b"x").unwrap();

    // Less than a day old: nothing yet.
    assert!(stale_dirs(temp, EXTRACT_PREFIX, SystemTime::now()).is_empty());

    // Two days later: only the folders with the prefix.
    let later = SystemTime::now() + Duration::from_secs(2 * 24 * 60 * 60);
    let mut stale = stale_dirs(temp, EXTRACT_PREFIX, later);
    stale.sort();
    assert_eq!(stale, vec![a.clone(), b.clone()]);
    assert_eq!(sweep_stale(temp, EXTRACT_PREFIX, later), 2);
    assert!(!a.exists() && !b.exists());
    assert_eq!(std::fs::read_dir(temp).unwrap().count(), 4);
}
