pub mod connections;
pub mod discover;
mod dispatch;
pub mod files;
pub mod remote;

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

#[tauri::command]
fn connections_get(
    store: tauri::State<'_, connections::Store>,
) -> Result<connections::Connections, String> {
    store.load()
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
    // Reject bad data before bothering the user with a window.
    let bytes = files::decode_base64(&bytes_base64)?;
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(files::sanitize_name(&suggested_name));
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("bookeeper.sqlite"))?;
            let state = AppState::open_with_data(db, SetupPolicy::Open, &dir)?;
            {
                // `setup` runs outside the runtime: enter Tauri's before spawning.
                let _guard = tauri::async_runtime::handle().inner().enter();
                bookeeper_core::backup::schedule::spawn(state.clone());
            }
            app.manage(connections::Store::new(&dir));
            app.manage(CoreRouter(bookeeper_core::router(state)));
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
            save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bookeeper");
}
