#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use bookeeper_setup_core::cmdline::{parse_invocation, Invocation};
use bookeeper_setup_core::{log::Log, quiet, sys};
use bookeeper_setup_lib::{commands, route, run_window, Route};

#[cfg(windows)]
fn restrict_dll_search() {
    use windows_sys::Win32::System::LibraryLoader::{
        SetDefaultDllDirectories, LOAD_LIBRARY_SEARCH_SYSTEM32,
    };
    // SAFETY: plain Win32 call with a valid flag, made before anything else loads a DLL.
    unsafe {
        SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
    }
}

#[cfg(not(windows))]
fn restrict_dll_search() {}

/// The command line exactly as Windows gave it, program name included.
#[cfg(windows)]
fn raw_command_line() -> String {
    use windows_sys::Win32::System::Environment::GetCommandLineW;
    // SAFETY: GetCommandLineW returns a NUL-terminated string that lives as long as the process.
    unsafe {
        let p = GetCommandLineW();
        let mut len = 0;
        while *p.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
    }
}

#[cfg(not(windows))]
fn raw_command_line() -> String {
    std::env::args().collect::<Vec<_>>().join(" ")
}

fn main() {
    restrict_dll_search();

    let invocation = match parse_invocation(&raw_command_line()) {
        Ok(i) => i,
        Err(e) => {
            Log::open(sys::platform().as_ref()).line(&format!("bad command line: {e}"));
            std::process::exit(2);
        }
    };
    let setup_exe = std::env::current_exe().unwrap_or_default();
    let platform = sys::platform();

    let (smoke, uninstall) = match route(&invocation) {
        Route::Quiet => std::process::exit(quiet::run(platform.as_ref(), &invocation, &setup_exe)),
        Route::Window { smoke, uninstall } => (smoke, uninstall),
    };

    // Without WebView2 there is no window: hand over to the classic installer.
    if cfg!(windows) && !platform.has_webview2() {
        let log = Log::open(platform.as_ref());
        let code = match commands::webview2_fallback(platform.as_ref(), &setup_exe, &log) {
            Ok(()) => 0,
            Err(e) => {
                log.line(&format!("no WebView2 and the fallback failed: {e}"));
                2
            }
        };
        std::process::exit(code);
    }
    debug_assert!(matches!(
        invocation,
        Invocation::Gui | Invocation::SmokeUi | Invocation::Uninstall(_)
    ));
    drop(platform);
    run_window(smoke, uninstall, setup_exe);
}
