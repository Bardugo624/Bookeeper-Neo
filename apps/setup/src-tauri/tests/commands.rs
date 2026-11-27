use bookeeper_setup_core::cmdline::{parse_invocation, Invocation};
use bookeeper_setup_core::ops::OpError;
use bookeeper_setup_core::payload::{encode_tail, FileMeta, Meta};
use bookeeper_setup_core::progress::{Snapshot, Step};
use bookeeper_setup_core::sys::{InstallState, MockSystem};
use bookeeper_setup_lib::commands::{
    build_info, check_target, Blocked, Context, ErrorCode, OpResult, ProblemCode, ProgressEvent,
    SetupMode,
};
use bookeeper_setup_lib::{route, Route};
use std::path::{Path, PathBuf};

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
