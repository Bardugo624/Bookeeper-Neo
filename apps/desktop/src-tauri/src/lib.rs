mod dispatch;

use bookeeper_core::{AppState, Db, SetupPolicy};
use tauri::Manager;

pub use dispatch::{dispatch, ApiResponse};

/// Core router shared with the webview commands through Tauri's managed state.
struct CoreRouter(axum::Router);

#[tauri::command]
async fn api_request(
    router: tauri::State<'_, CoreRouter>,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<ApiResponse, ()> {
    // Never `Err`: transport failures are reported inside `ApiResponse`.
    Ok(dispatch(router.0.clone(), &method, &path, body).await)
}

pub fn run() {
    tauri::Builder::default()
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
            app.manage(CoreRouter(bookeeper_core::router(state)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_request])
        .run(tauri::generate_context!())
        .expect("error while running Bookeeper");
}
