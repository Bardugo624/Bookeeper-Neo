//! The Setup window: created by code, hidden until the interface calls `ready`.
//! WebView2 keeps its data in a private temp folder per run; old ones are swept at start.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "main";
pub const WEBVIEW_PREFIX: &str = "bookeeper-setup-webview-";
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// Removes `bookeeper-setup-webview-*` folders in `temp` not touched for a day.
/// Returns how many were removed.
pub fn sweep_stale(temp: &Path, now: SystemTime) -> usize {
    let Ok(rd) = std::fs::read_dir(temp) else {
        return 0;
    };
    let mut removed = 0;
    for entry in rd.flatten() {
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with(WEBVIEW_PREFIX)
        {
            continue;
        }
        let old = entry
            .metadata()
            .ok()
            .filter(|m| m.is_dir())
            .and_then(|m| m.modified().ok())
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > STALE_AFTER);
        if old && std::fs::remove_dir_all(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
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

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let temp = std::env::temp_dir();
    sweep_stale(&temp, SystemTime::now());
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Bookeeper Setup")
        .inner_size(800.0, 520.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .center()
        .visible(false)
        .data_directory(private_data_dir(&temp))
        .build()?;
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
        assert_eq!(sweep_stale(tmp.path(), later), 1);
        assert!(!old.exists());
        assert!(other.exists());
        // Fresh folders stay.
        let fresh = tmp.path().join(format!("{WEBVIEW_PREFIX}new"));
        std::fs::create_dir_all(&fresh).unwrap();
        assert_eq!(sweep_stale(tmp.path(), SystemTime::now()), 0);
        assert!(fresh.exists());
    }
}
