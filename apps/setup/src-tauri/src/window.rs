//! The Setup window: created by code, hidden until the interface calls `ready`.
//! WebView2 keeps its data in a private temp folder per run; old ones are swept at start.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "main";
pub const WEBVIEW_PREFIX: &str = "bookeeper-setup-webview-";
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// Folders in `temp` named `<prefix>…` and not touched for a day: what earlier runs left.
pub fn stale_dirs(temp: &Path, prefix: &str, now: SystemTime) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(temp) else {
        return Vec::new();
    };
    rd.flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(prefix))
        .filter(|e| {
            e.metadata()
                .ok()
                .filter(|m| m.is_dir())
                .and_then(|m| m.modified().ok())
                .and_then(|t| now.duration_since(t).ok())
                .is_some_and(|age| age > STALE_AFTER)
        })
        .map(|e| e.path())
        .collect()
}

/// Removes the `stale_dirs`, skipping any that cannot be removed. Returns how many went.
pub fn sweep_stale(temp: &Path, prefix: &str, now: SystemTime) -> usize {
    stale_dirs(temp, prefix, now)
        .iter()
        .filter(|d| std::fs::remove_dir_all(d).is_ok())
        .count()
}

fn private_data_dir(temp: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    temp.join(format!(
        "{WEBVIEW_PREFIX}{:x}-{:x}",
        std::process::id(),
        nanos
    ))
}

/// The WebView2 arguments wry passes by default: `additional_browser_args` replaces them.
const WRY_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
/// In `--smoke-ui`, WebView2 writes its own log here, in the temp folder.
pub const WEBVIEW_LOG: &str = "Bookeeper-Setup-webview.log";

/// wry's arguments plus WebView2's own log, for the CI's look at the window.
fn smoke_browser_args(temp: &Path) -> String {
    format!(
        "{WRY_BROWSER_ARGS} --enable-logging --v=1 --log-file=\"{}\"",
        temp.join(WEBVIEW_LOG).display()
    )
}

pub fn create(app: &AppHandle, smoke: bool) -> tauri::Result<()> {
    let temp = std::env::temp_dir();
    sweep_stale(&temp, WEBVIEW_PREFIX, SystemTime::now());
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Bookeeper Setup")
        .inner_size(800.0, 520.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .center()
        .visible(false)
        .data_directory(private_data_dir(&temp));
    if smoke {
        builder = builder.additional_browser_args(&smoke_browser_args(&temp));
    }
    builder.build()?;
    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// A second launch: bring the window forward, without revealing it before `ready`.
pub fn focus(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.unminimize();
        if w.is_visible().unwrap_or(false) {
            let _ = w.set_focus();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_removes_only_old_webview_folders() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join(format!("{WEBVIEW_PREFIX}old"));
        let other = tmp.path().join("something-else");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        // Pretend it is two days later.
        let later = SystemTime::now() + Duration::from_secs(2 * 24 * 60 * 60);
        assert_eq!(sweep_stale(tmp.path(), WEBVIEW_PREFIX, later), 1);
        assert!(!old.exists());
        assert!(other.exists());
        // Fresh folders stay.
        let fresh = tmp.path().join(format!("{WEBVIEW_PREFIX}new"));
        std::fs::create_dir_all(&fresh).unwrap();
        assert_eq!(
            sweep_stale(tmp.path(), WEBVIEW_PREFIX, SystemTime::now()),
            0
        );
        assert!(fresh.exists());
    }

    #[test]
    fn smoke_browser_args_keep_wry_defaults_and_add_the_log() {
        let args = smoke_browser_args(Path::new(r"C:\Temp dir"));
        assert!(args.starts_with("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection "));
        assert!(args.contains("--enable-logging --v=1"));
        let log = Path::new(r"C:\Temp dir").join(WEBVIEW_LOG);
        assert!(args.ends_with(&format!("--log-file=\"{}\"", log.display())));
    }
}
