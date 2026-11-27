//! Bookeeper Setup: the Tauri shell around `bookeeper-setup-core`.

pub mod commands;
pub mod window;

use bookeeper_setup_core::cmdline::Invocation;
use bookeeper_setup_core::log::Log;
use bookeeper_setup_core::sys;
use commands::{AppState, Context};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;

/// Which way an invocation goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    /// `quiet::run`: no Tauri, no WebView2.
    Quiet,
    /// The window.
    Window { smoke: bool, uninstall: bool },
}

pub fn route(invocation: &Invocation) -> Route {
    match invocation {
        Invocation::QuietInstall(_) => Route::Quiet,
        Invocation::Uninstall(a) if a.quiet || a.passive => Route::Quiet,
        Invocation::Uninstall(_) => Route::Window {
            smoke: false,
            uninstall: true,
        },
        Invocation::SmokeUi => Route::Window {
            smoke: true,
            uninstall: false,
        },
        Invocation::Gui => Route::Window {
            smoke: false,
            uninstall: false,
        },
    }
}

/// How long `--smoke-ui` waits for the interface to call `ready`.
const SMOKE_DEADLINE: std::time::Duration = std::time::Duration::from_secs(30);

pub fn run_window(smoke: bool, uninstall: bool, setup_exe: PathBuf) {
    let platform = sys::platform();
    let log = Log::open(platform.as_ref());
    let webview = tauri::webview_version().unwrap_or_else(|e| format!("unknown ({e})"));
    log.line(&format!(
        "window: start (smoke: {smoke}, WebView2 {webview})"
    ));
    let log_path = log.path().to_path_buf();
    let state = Arc::new(AppState {
        sys: platform,
        ctx: Context {
            setup_exe,
            uninstall_requested: uninstall,
            supported: cfg!(windows),
        },
        log,
        smoke,
    });

    if smoke {
        let deadline_log = Log::at(log_path.clone());
        std::thread::spawn(move || {
            std::thread::sleep(SMOKE_DEADLINE);
            deadline_log.line(&format!(
                "smoke: no ready after {} s",
                SMOKE_DEADLINE.as_secs()
            ));
            std::process::exit(2);
        });
    }
    let page_log = Log::at(log_path.clone());
    let setup_log = Log::at(log_path.clone());

    let result = tauri::Builder::default()
        // First: a second launch must not get past this.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            window::focus(app);
            if args.iter().any(|a| a == "--uninstall") {
                let _ = app.emit(commands::UNINSTALL_REQUESTED_EVENT, ());
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .on_page_load(move |_, payload| {
            page_log.line(&format!("window: page {:?}", payload.event()));
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::setup_info,
            commands::check_dir,
            commands::install,
            commands::uninstall,
            commands::launch_app,
            commands::log_tail,
            commands::ready,
            commands::quit,
        ])
        .setup(move |app| {
            setup_log.line("window: creating");
            window::create(app.handle())?;
            setup_log.line("window: created");
            Ok(())
        })
        .run(tauri::generate_context!());
    if let Err(e) = result {
        Log::at(log_path).line(&format!("window: {e}"));
        eprintln!("bookeeper-setup: {e}");
        std::process::exit(2);
    }
}
