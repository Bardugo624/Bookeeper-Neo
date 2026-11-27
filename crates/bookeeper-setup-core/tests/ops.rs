use bookeeper_setup_core::log::Log;
use bookeeper_setup_core::ops::{self, InstallOptions, Mode, OpError};
use bookeeper_setup_core::payload::{encode_tail, FileMeta, Meta};
use bookeeper_setup_core::progress::Snapshot;
use bookeeper_setup_core::sys::{InstallState, MockSystem, RunOutcome, System};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

const MAIN: &[u8] = b"the real bookeeper-desktop executable, long enough to matter";

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
    log: Log,
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
    let mut bytes = b"MZ light setup program".to_vec();
    bytes.extend_from_slice(&installer);
    bytes.extend_from_slice(&encode_tail(&meta, installer.len() as u64));
    let setup = root.join("Bookeeper-Setup-2.2.0.exe");
    std::fs::write(&setup, bytes).unwrap();
    let log = Log::open(&*sys);
    Fixture {
        _tmp: tmp,
        root,
        sys,
        setup,
        log,
    }
}

/// The folder NSIS was told to use, read back from the raw arguments.
fn dir_of(args: &str) -> PathBuf {
    PathBuf::from(
        args.split("/D=")
            .nth(1)
            .or_else(|| args.split("_?=").nth(1))
            .unwrap(),
    )
}

/// A fake NSIS installer that writes `main` and an uninstaller.
fn fake_nsis(f: &Fixture, main: &'static [u8]) {
    f.sys.on_run(move |rec| {
        let dir = dir_of(&rec.raw_args);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("bookeeper-desktop.exe"), main).unwrap();
        std::fs::write(dir.join("uninstall.exe"), b"u").unwrap();
        RunOutcome::Exited(0)
    });
}

fn opts(dir: &Path, mode: Mode) -> InstallOptions {
    InstallOptions {
        dir: dir.to_path_buf(),
        desktop_icon: true,
        autostart: false,
        mode,
    }
}

fn run_install(f: &Fixture, o: &InstallOptions) -> (Result<(), OpError>, Vec<Snapshot>) {
    let mut snaps = vec![];
    let r = ops::install(&*f.sys, &f.setup, o, &mut |s| snaps.push(s), &f.log);
    (r, snaps)
}

#[test]
fn install_runs_nsis_with_exact_args() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    let dir = f.root.join("Prova Bookeeper").join("Libreria è");
    let (r, _) = run_install(&f, &opts(&dir, Mode::Install));
    assert_eq!(r, Ok(()));
    let runs = f.sys.runs.lock().unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].raw_args, format!("/S /D={}", dir.display()));
    assert!(runs[0].program.starts_with(f.sys.temp_dir()));
    let envs: Vec<_> = runs[0]
        .env
        .iter()
        .map(|(k, _)| k.to_string_lossy().into_owned())
        .collect();
    assert!(envs.contains(&"TEMP".to_string()) && envs.contains(&"TMP".to_string()));
    // The private TEMP sits inside the extraction folder.
    let temp_value = PathBuf::from(&runs[0].env[0].1);
    assert!(temp_value.starts_with(runs[0].program.parent().unwrap()));
}

#[test]
fn update_and_repair_use_the_update_line() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    let dir = f.root.join("App");
    let (r, _) = run_install(&f, &opts(&dir, Mode::Update));
    assert_eq!(r, Ok(()));
    assert_eq!(
        f.sys.runs.lock().unwrap()[0].raw_args,
        format!("/S /UPDATE /D={}", dir.display())
    );
}

#[test]
fn install_verifies_main_hash() {
    let f = fixture();
    // Same size, different bytes, exit code 0.
    let mut other = MAIN.to_vec();
    other[0] ^= 0xff;
    let other: &'static [u8] = Box::leak(other.into_boxed_slice());
    fake_nsis(&f, other);
    let (r, _) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert!(matches!(r, Err(OpError::Verification(_))), "{r:?}");
}

#[test]
fn install_refuses_when_app_running() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    *f.sys.running.lock().unwrap() = true;
    let (r, snaps) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert_eq!(r, Err(OpError::AppRunning));
    assert!(f.sys.runs.lock().unwrap().is_empty());
    assert!(snaps.is_empty());
    assert!(!f.root.join("App").exists());
}

#[test]
fn install_reports_nsis_failure_code() {
    let f = fixture();
    f.sys.on_run(|_| RunOutcome::Exited(2));
    let (r, _) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert_eq!(r, Err(OpError::NsisFailed { code: 2 }));
}

#[test]
fn install_times_out() {
    let f = fixture();
    f.sys.on_run(|_| RunOutcome::TimedOut);
    let (r, _) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert_eq!(r, Err(OpError::TimedOut));
}

#[test]
fn install_rejects_a_setup_without_payload() {
    let f = fixture();
    std::fs::write(&f.setup, b"MZ nothing attached").unwrap();
    let (r, _) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert!(matches!(r, Err(OpError::Payload(_))), "{r:?}");
}

#[test]
fn update_ignores_old_main_until_rewritten() {
    let f = fixture();
    let dir = f.root.join("App");
    std::fs::create_dir_all(&dir).unwrap();
    // The old executable is already at full size.
    std::fs::write(dir.join("bookeeper-desktop.exe"), MAIN).unwrap();
    // 1: old file in place, 2: emptied, 3: rewritten.
    let phase = Arc::new(AtomicU8::new(0));
    let p = phase.clone();
    f.sys.on_run(move |rec| {
        let d = dir_of(&rec.raw_args);
        p.store(1, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(900));
        std::fs::write(d.join("bookeeper-desktop.exe"), b"").unwrap();
        p.store(2, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(500));
        std::fs::write(d.join("bookeeper-desktop.exe"), MAIN).unwrap();
        p.store(3, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(400));
        RunOutcome::Exited(0)
    });
    let mut seen: Vec<(u8, f32)> = vec![];
    let r = ops::install(
        &*f.sys,
        &f.setup,
        &opts(&dir, Mode::Repair),
        &mut |s| seen.push((phase.load(Ordering::SeqCst), s.fraction)),
        &f.log,
    );
    assert_eq!(r, Ok(()));
    let before: Vec<_> = seen.iter().filter(|(p, _)| *p == 1 || *p == 2).collect();
    assert!(
        before.len() >= 3,
        "expected polls while waiting: {before:?}"
    );
    assert!(
        before.iter().all(|(_, fr)| *fr < 0.9),
        "old main must not count: {before:?}"
    );
    assert!(seen.iter().any(|(_, fr)| *fr >= 0.9));
}

#[test]
fn install_removes_only_our_desktop_shortcut() {
    for (target_is_ours, expect_kept) in [(true, false), (false, true)] {
        let f = fixture();
        fake_nsis(&f, MAIN);
        let dir = f.root.join("App");
        let lnk = f.sys.desktop_dir().join("Bookeeper.lnk");
        std::fs::write(&lnk, b"lnk").unwrap();
        let target = if target_is_ours {
            dir.join("bookeeper-desktop.exe")
        } else {
            f.root.join("Other").join("bookeeper-desktop.exe")
        };
        f.sys.shortcuts.lock().unwrap().insert(lnk.clone(), target);
        let mut o = opts(&dir, Mode::Install);
        o.desktop_icon = false;
        let (r, _) = run_install(&f, &o);
        assert_eq!(r, Ok(()));
        assert_eq!(lnk.exists(), expect_kept);
    }
}

#[test]
fn install_keeps_desktop_shortcut_when_wanted() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    let dir = f.root.join("App");
    let lnk = f.sys.desktop_dir().join("Bookeeper.lnk");
    std::fs::write(&lnk, b"lnk").unwrap();
    f.sys
        .shortcuts
        .lock()
        .unwrap()
        .insert(lnk.clone(), dir.join("bookeeper-desktop.exe"));
    let (r, _) = run_install(&f, &opts(&dir, Mode::Install));
    assert_eq!(r, Ok(()));
    assert!(lnk.exists());
}

#[test]
fn install_enables_autostart_when_asked() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    let dir = f.root.join("App");
    let mut o = opts(&dir, Mode::Install);
    o.autostart = true;
    assert_eq!(run_install(&f, &o).0, Ok(()));
    assert_eq!(
        *f.sys.autostart.lock().unwrap(),
        Some(dir.join("bookeeper-desktop.exe"))
    );

    let f = fixture();
    fake_nsis(&f, MAIN);
    assert_eq!(
        run_install(&f, &opts(&f.root.join("App"), Mode::Install)).0,
        Ok(())
    );
    assert_eq!(*f.sys.autostart.lock().unwrap(), None);
}

#[test]
fn install_cleans_temp() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    assert_eq!(
        run_install(&f, &opts(&f.root.join("App"), Mode::Install)).0,
        Ok(())
    );
    let left: Vec<_> = std::fs::read_dir(f.sys.temp_dir())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(left, vec!["Bookeeper-Setup.log".to_string()]);

    // Also after a failure.
    let f = fixture();
    f.sys.on_run(|_| RunOutcome::Exited(1));
    assert!(run_install(&f, &opts(&f.root.join("App"), Mode::Install))
        .0
        .is_err());
    let left = std::fs::read_dir(f.sys.temp_dir())
        .unwrap()
        .flatten()
        .count();
    assert_eq!(left, 1);
}

#[test]
fn install_progress_is_monotonic_and_finishes() {
    let f = fixture();
    // NSIS unpacks into its ns*.tmp file inside the private TEMP, then writes main.
    f.sys.on_run(|rec| {
        let tmp = PathBuf::from(&rec.env[0].1);
        std::fs::write(tmp.join("nsa1234.tmp"), vec![0u8; 1024 * 1024]).unwrap();
        std::thread::sleep(Duration::from_millis(350));
        std::fs::write(tmp.join("nsa1234.tmp"), vec![0u8; 4 * 1024 * 1024]).unwrap();
        std::thread::sleep(Duration::from_millis(350));
        let d = dir_of(&rec.raw_args);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("bookeeper-desktop.exe"), MAIN).unwrap();
        RunOutcome::Exited(0)
    });
    let (r, snaps) = run_install(&f, &opts(&f.root.join("App"), Mode::Install));
    assert_eq!(r, Ok(()));
    assert!(snaps.len() > 5);
    assert!(
        snaps.windows(2).all(|w| w[1].fraction >= w[0].fraction),
        "went backwards"
    );
    let last = snaps.last().unwrap();
    assert!(last.done && (last.fraction - 1.0).abs() < 1e-6);
    assert!(snaps[..snaps.len() - 1].iter().all(|s| !s.done));
}

fn seed_installation(f: &Fixture) -> PathBuf {
    let dir = f.root.join("Mario Rossi").join("Bookeeper");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("bookeeper-desktop.exe"), MAIN).unwrap();
    std::fs::write(dir.join("uninstall.exe"), b"u").unwrap();
    std::fs::write(dir.join("bookeeper-setup.exe"), b"s").unwrap();
    // The fake uninstaller removes the app, as NSIS does with `_?=`.
    f.sys.on_run(|rec| {
        let d = dir_of(&rec.raw_args);
        std::fs::remove_file(d.join("bookeeper-desktop.exe")).unwrap();
        std::fs::remove_file(d.join("bookeeper-setup.exe")).ok();
        RunOutcome::Exited(0)
    });
    dir
}

fn seed_data(f: &Fixture) {
    let a = f.sys.app_data().join("org.bookeeper.desktop");
    let l = f.sys.local_app_data().join("org.bookeeper.desktop");
    std::fs::create_dir_all(a.join("ebooks")).unwrap();
    std::fs::create_dir_all(&l).unwrap();
    std::fs::write(a.join("bookeeper.sqlite"), vec![1u8; 1000]).unwrap();
    std::fs::write(a.join("ebooks").join("b.epub"), vec![1u8; 500]).unwrap();
    std::fs::write(l.join("cache.bin"), vec![1u8; 24]).unwrap();
    *f.sys.credentials.lock().unwrap() = vec![
        "token.org.bookeeper.desktop".into(),
        "orfana.org.bookeeper.desktop".into(),
        "altra.app".into(),
    ];
    let mut k = f.sys.registry_keys.lock().unwrap();
    k.insert(r"Software\bookeeper".into());
    k.insert(r"Software\bookeeper\Bookeeper".into());
    drop(k);
    *f.sys.autostart.lock().unwrap() = Some(PathBuf::from("x.exe"));
}

fn run_uninstall(f: &Fixture, dir: &Path, delete: bool) -> (Result<(), OpError>, Vec<Snapshot>) {
    let mut snaps = vec![];
    let r = ops::uninstall(&*f.sys, dir, delete, &mut |s| snaps.push(s), &f.log);
    (r, snaps)
}

#[test]
fn uninstall_is_synchronous_and_complete() {
    let f = fixture();
    let dir = seed_installation(&f);
    let (r, snaps) = run_uninstall(&f, &dir, false);
    assert_eq!(r, Ok(()));
    assert!(!dir.join("bookeeper-desktop.exe").exists());
    assert!(!dir.join("uninstall.exe").exists());
    assert_eq!(*f.sys.self_deleted.lock().unwrap(), vec![dir.clone()]);
    assert!(!dir.exists(), "empty folder removed");
    assert_eq!(*f.sys.autostart.lock().unwrap(), None);
    let runs = f.sys.runs.lock().unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].raw_args, format!("/S _?={}", dir.display()));
    assert!(snaps.last().unwrap().done);
}

#[test]
fn uninstall_fails_if_main_survives() {
    let f = fixture();
    let dir = seed_installation(&f);
    f.sys.on_run(|_| RunOutcome::Exited(0));
    let (r, _) = run_uninstall(&f, &dir, false);
    assert!(matches!(r, Err(OpError::Verification(_))));
}

#[test]
fn uninstall_refuses_when_app_running_and_reports_codes() {
    let f = fixture();
    let dir = seed_installation(&f);
    *f.sys.running.lock().unwrap() = true;
    assert_eq!(run_uninstall(&f, &dir, false).0, Err(OpError::AppRunning));
    *f.sys.running.lock().unwrap() = false;
    f.sys.on_run(|_| RunOutcome::Exited(5));
    assert_eq!(
        run_uninstall(&f, &dir, false).0,
        Err(OpError::NsisFailed { code: 5 })
    );
    f.sys.on_run(|_| RunOutcome::TimedOut);
    assert_eq!(run_uninstall(&f, &dir, false).0, Err(OpError::TimedOut));
}

#[test]
fn uninstall_keep_leaves_data_and_credentials() {
    let f = fixture();
    let dir = seed_installation(&f);
    seed_data(&f);
    assert_eq!(run_uninstall(&f, &dir, false).0, Ok(()));
    assert!(f
        .sys
        .app_data()
        .join("org.bookeeper.desktop")
        .join("bookeeper.sqlite")
        .exists());
    assert!(f
        .sys
        .local_app_data()
        .join("org.bookeeper.desktop")
        .exists());
    assert_eq!(f.sys.credentials.lock().unwrap().len(), 3);
    assert_eq!(f.sys.registry_keys.lock().unwrap().len(), 2);
}

#[test]
fn uninstall_delete_removes_all_suffixed_credentials() {
    let f = fixture();
    let dir = seed_installation(&f);
    seed_data(&f);
    assert_eq!(run_uninstall(&f, &dir, true).0, Ok(()));
    assert_eq!(
        *f.sys.credentials.lock().unwrap(),
        vec!["altra.app".to_string()]
    );
}

#[test]
fn uninstall_delete_removes_data_dirs_and_registry() {
    let f = fixture();
    let dir = seed_installation(&f);
    seed_data(&f);
    assert_eq!(run_uninstall(&f, &dir, true).0, Ok(()));
    assert!(!f.sys.app_data().join("org.bookeeper.desktop").exists());
    assert!(!f
        .sys
        .local_app_data()
        .join("org.bookeeper.desktop")
        .exists());
    assert!(f.sys.registry_keys.lock().unwrap().is_empty());
}

#[test]
fn data_summary_reports_library_and_ebooks() {
    let f = fixture();
    let s = ops::data_summary(&*f.sys);
    assert_eq!((s.bytes, s.has_library, s.has_ebooks), (0, false, false));
    seed_data(&f);
    let s = ops::data_summary(&*f.sys);
    assert_eq!((s.bytes, s.has_library, s.has_ebooks), (1524, true, true));
    std::fs::remove_dir_all(
        f.sys
            .app_data()
            .join("org.bookeeper.desktop")
            .join("ebooks"),
    )
    .unwrap();
    let s = ops::data_summary(&*f.sys);
    assert_eq!((s.bytes, s.has_library, s.has_ebooks), (1024, true, false));
}

#[test]
fn read_state_strips_quotes_and_requires_main_exe() {
    let f = fixture();
    assert_eq!(ops::read_state(&*f.sys), None);
    let dir = f.root.join("Mario Rossi").join("Bookeeper");
    std::fs::create_dir_all(&dir).unwrap();
    *f.sys.installed.lock().unwrap() = Some(InstallState {
        dir: PathBuf::from(format!("\"{}\"", dir.display())),
        version: "2.1.0".into(),
    });
    assert_eq!(ops::read_state(&*f.sys), None, "no main exe yet");
    std::fs::write(dir.join("bookeeper-desktop.exe"), MAIN).unwrap();
    assert_eq!(
        ops::read_state(&*f.sys),
        Some(InstallState {
            dir: dir.clone(),
            version: "2.1.0".into()
        })
    );
    *f.sys.installed.lock().unwrap() = Some(InstallState {
        dir: dir.clone(),
        version: "2.1.0".into(),
    });
    assert!(ops::read_state(&*f.sys).is_some());
}

#[test]
fn log_records_commands_and_codes() {
    let f = fixture();
    fake_nsis(&f, MAIN);
    let dir = f.root.join("App");
    assert_eq!(run_install(&f, &opts(&dir, Mode::Install)).0, Ok(()));
    let tail = f.log.tail(200);
    assert!(tail.contains(&format!("/S /D={}", dir.display())), "{tail}");
    assert!(tail.contains("exit: 0"), "{tail}");
}
