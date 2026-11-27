//! Open at login. Windows goes through the Setup's registry code; Mac and Linux through
//! `tauri-plugin-autostart` (registered in `run`).

#[cfg(windows)]
pub fn get<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) -> Result<bool, String> {
    bookeeper_setup_core::autostart::is_enabled().map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn set<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, on: bool) -> Result<(), String> {
    use bookeeper_setup_core::autostart;
    if on {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        autostart::enable(&exe)
    } else {
        autostart::disable()
    }
    .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn get<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn set<R: tauri::Runtime>(app: &tauri::AppHandle<R>, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launch = app.autolaunch();
    if on { launch.enable() } else { launch.disable() }.map_err(|e| e.to_string())
}
