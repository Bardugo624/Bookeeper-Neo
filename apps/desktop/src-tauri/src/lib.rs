pub mod autostart;
pub mod connections;
pub mod discover;
mod dispatch;
pub mod download;
pub mod files;
pub mod remote;
pub mod secrets;
pub mod sharing;
pub mod startup;
pub mod updates;

use bookeeper_core::{AppState, Db, SetupPolicy};
use tauri::Manager;

pub use dispatch::{dispatch, dispatch_raw, ApiResponse, RawApiResponse};

/// Core router shared with the webview commands through Tauri's managed state.
struct CoreRouter(axum::Router);

// snake_case: `connection_id` and `body_base64` reach the shell as the webview sends them.
#[tauri::command(rename_all = "snake_case")]
async fn api_request(
    router: tauri::State<'_, CoreRouter>,
    store: tauri::State<'_, connections::Store>,
    method: String,
    path: String,
    body: Option<String>,
    headers: Option<std::collections::BTreeMap<String, String>>,
    connection_id: Option<String>,
) -> Result<ApiResponse, ()> {
    // Never `Err`: transport failures are reported inside `ApiResponse`.
    Ok(remote::route(
        &store,
        router.0.clone(),
        connection_id.as_deref(),
        &method,
        &path,
        body,
        headers.unwrap_or_default(),
    )
    .await)
}

#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
async fn api_request_raw(
    router: tauri::State<'_, CoreRouter>,
    store: tauri::State<'_, connections::Store>,
    method: String,
    path: String,
    body_base64: Option<String>,
    content_type: Option<String>,
    headers: Option<std::collections::BTreeMap<String, String>>,
    connection_id: Option<String>,
) -> Result<RawApiResponse, ()> {
    Ok(remote::route_raw(
        &store,
        router.0.clone(),
        connection_id.as_deref(),
        &method,
        &path,
        body_base64,
        content_type,
        headers.unwrap_or_default(),
    )
    .await)
}

#[tauri::command]
async fn server_probe(url: String) -> Result<remote::ProbeOut, ()> {
    Ok(remote::probe(&url).await)
}

#[tauri::command]
async fn discover() -> Result<Vec<discover::Found>, ()> {
    Ok(discover::discover().await)
}

/// `connections_get` answer: the saved connections plus where tokens live.
#[derive(serde::Serialize)]
pub struct ConnectionsView {
    #[serde(flatten)]
    pub connections: connections::Connections,
    /// `"keychain"` or `"file"`.
    pub secrets: &'static str,
}

pub fn connections_view(store: &connections::Store) -> Result<ConnectionsView, String> {
    Ok(ConnectionsView {
        connections: store.load()?,
        secrets: store.mode().as_str(),
    })
}

#[tauri::command]
fn connections_get(store: tauri::State<'_, connections::Store>) -> Result<ConnectionsView, String> {
    connections_view(&store)
}

#[tauri::command]
fn connection_upsert(
    store: tauri::State<'_, connections::Store>,
    connection: connections::Connection,
) -> Result<connections::Connections, String> {
    store.upsert(connection)
}

#[tauri::command]
fn connection_activate(
    store: tauri::State<'_, connections::Store>,
    id: String,
) -> Result<connections::Connections, String> {
    store.activate(&id)
}

#[tauri::command]
fn connection_remove(
    store: tauri::State<'_, connections::Store>,
    id: String,
) -> Result<connections::Connections, String> {
    store.remove(&id)
}

#[tauri::command(rename_all = "snake_case")]
async fn save_file(
    app: tauri::AppHandle,
    suggested_name: String,
    bytes_base64: String,
    filters: Option<Vec<files::FileFilter>>,
) -> Result<files::SaveOutcome, String> {
    use tauri_plugin_dialog::DialogExt;
    static SAVE_LOCK: files::SaveLock = files::SaveLock::new();
    let Some(_permit) = SAVE_LOCK.try_acquire() else {
        return Ok(files::SaveOutcome {
            saved: false,
            path: None,
        });
    };
    // Reject bad data before bothering the user with a window.
    let bytes = files::decode_base64(&bytes_base64)?;
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(files::sanitize_name(&suggested_name));
    if let Some(main) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&main);
    }
    for f in filters.unwrap_or_default() {
        let (name, exts) = files::filter_parts(&f);
        let refs: Vec<&str> = exts.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(name, &refs);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |p| {
        let _ = tx.send(p);
    });
    let Some(path) = rx
        .await
        .map_err(|e| e.to_string())?
        .and_then(files::path_of)
    else {
        return Ok(files::SaveOutcome {
            saved: false,
            path: None,
        });
    };
    tauri::async_runtime::spawn_blocking(move || {
        files::write_atomic(&path, &bytes)?;
        Ok(files::SaveOutcome {
            saved: true,
            path: Some(path.display().to_string()),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves a library file to disk as it arrives. The answer is opened first (so a refusal never
/// opens the "Save as" window), then the user picks the place, then the bytes are streamed.
#[tauri::command(rename_all = "snake_case")]
async fn download_file(
    app: tauri::AppHandle,
    router: tauri::State<'_, CoreRouter>,
    store: tauri::State<'_, connections::Store>,
    url: String,
    suggested_name: String,
    headers: Option<std::collections::BTreeMap<String, String>>,
    connection_id: Option<String>,
) -> Result<download::DownloadOutcome, String> {
    use tauri_plugin_dialog::DialogExt;
    static DOWNLOAD_LOCK: files::SaveLock = files::SaveLock::new();
    let Some(_permit) = DOWNLOAD_LOCK.try_acquire() else {
        return Ok(download::DownloadOutcome::busy());
    };
    let mut opened = download::open(
        &store,
        router.0.clone(),
        connection_id.as_deref(),
        &url,
        &headers.unwrap_or_default(),
    )
    .await?;
    if !(200..300).contains(&opened.status) {
        return Ok(download::DownloadOutcome::refused(opened.status));
    }
    let proposed = opened
        .disposition
        .as_deref()
        .and_then(download::disposition_name)
        .unwrap_or(suggested_name);
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(files::sanitize_name(&proposed));
    if let Some(main) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&main);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |p| {
        let _ = tx.send(p);
    });
    let Some(path) = rx
        .await
        .map_err(|e| e.to_string())?
        .and_then(files::path_of)
    else {
        return Ok(download::DownloadOutcome::cancelled());
    };
    download::write_stream(&mut opened.source, &path).await?;
    Ok(download::DownloadOutcome {
        saved: true,
        path: Some(path.display().to_string()),
        status: None,
        busy: false,
    })
}

#[tauri::command]
async fn sharing_status(
    sharing: tauri::State<'_, sharing::Sharing>,
) -> Result<sharing::SharingStatus, ()> {
    Ok(sharing.status().await)
}

#[tauri::command(rename_all = "snake_case")]
async fn sharing_set(
    sharing: tauri::State<'_, sharing::Sharing>,
    enabled: bool,
    port: Option<u16>,
) -> Result<sharing::SharingStatus, ()> {
    Ok(sharing.set(enabled, port).await)
}

#[tauri::command]
async fn update_check(
    app: tauri::AppHandle,
    channel: String,
) -> Result<updates::UpdateState, String> {
    updates::check(&app, &channel).await
}

#[tauri::command]
async fn update_install(app: tauri::AppHandle, channel: String) -> Result<(), String> {
    updates::install(&app, &channel).await
}

#[tauri::command]
fn autostart_get(app: tauri::AppHandle) -> Result<bool, String> {
    autostart::get(&app)
}

#[tauri::command]
fn autostart_set(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    autostart::set(&app, on)
}

/// Brings the main window back: a second launch lands here.
fn focus_main(app: &tauri::AppHandle) {
    let outcome = app.try_state::<startup::Outcome>().map(|s| *s);
    if !startup::second_launch_shows_main(outcome) {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Shows the window, minimized first when the start came from the login entry.
fn show_main(app: &tauri::AppHandle, mode: startup::LaunchMode) {
    if let Some(w) = app.get_webview_window("main") {
        if mode == startup::LaunchMode::Minimized {
            let _ = w.minimize();
        }
        let _ = w.show();
    }
}

/// The library is from a newer version: say so in a system message and exit with 1.
fn report_newer_library(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    let handle = app.clone();
    app.dialog()
        .message(startup::newer_library_message())
        .title("Bookeeper")
        .kind(MessageDialogKind::Error)
        .show(move |_| handle.exit(1));
}

pub fn run() {
    let mut context = tauri::generate_context!();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());
    // The updater plugin reads its key from the configuration: hand it the one baked in at
    // build time, so `tauri.conf.json` needs no entry. Without a key it is not loaded at all.
    if let Some(key) = updates::pubkey() {
        context
            .config_mut()
            .plugins
            .0
            .insert("updater".into(), serde_json::json!({ "pubkey": key }));
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }
    #[cfg(not(windows))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![startup::AUTOSTART_ARG]),
        ));
    }
    builder
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = match Db::open(&dir.join("bookeeper.sqlite")) {
                Ok(db) => db,
                Err(bookeeper_core::DbError::NewerSchema { .. }) => {
                    app.manage(startup::Outcome::NewerLibrary);
                    report_newer_library(app.handle());
                    return Ok(());
                }
                Err(e) => return Err(e.into()),
            };
            let state = AppState::open_with_data(db, SetupPolicy::Open, &dir)?;
            {
                // `setup` runs outside the runtime: enter Tauri's before spawning.
                let _guard = tauri::async_runtime::handle().inner().enter();
                bookeeper_core::backup::schedule::spawn(state.clone());
            }
            let system: std::sync::Arc<dyn secrets::SecretStore> =
                std::sync::Arc::new(secrets::SystemStore);
            let mode = secrets::probe(system.as_ref());
            app.manage(connections::Store::with_secrets(&dir, system, mode));
            let sharing = sharing::Sharing::new(&dir, state.clone());
            app.manage(sharing.clone());
            tauri::async_runtime::spawn(async move {
                sharing.restore().await;
            });
            app.manage(CoreRouter(bookeeper_core::router(state)));
            let marker = dir.join(startup::UPDATE_MARKER);
            let updated = marker.exists();
            let _ = std::fs::remove_file(&marker);
            let args: Vec<String> = std::env::args().collect();
            app.manage(startup::Outcome::Ready);
            show_main(app.handle(), startup::launch_mode(&args, updated));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api_request,
            api_request_raw,
            connections_get,
            connection_upsert,
            connection_activate,
            connection_remove,
            server_probe,
            discover,
            save_file,
            download_file,
            sharing_status,
            sharing_set,
            update_check,
            update_install,
            autostart_get,
            autostart_set
        ])
        .build(context)
        .expect("error while building Bookeeper")
        .run(|app, event| {
            // Closing the app stops sharing: the port never outlives it.
            if let tauri::RunEvent::Exit = event {
                if let Some(sharing) = app.try_state::<sharing::Sharing>() {
                    tauri::async_runtime::block_on(sharing.shutdown());
                }
            }
        });
}
