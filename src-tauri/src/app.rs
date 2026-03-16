use crate::{
    config,
    detection,
    models::{AppSettings, DetectDrivesResponse},
    sync_engine::SyncCoordinator,
};
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub coordinator: SyncCoordinator,
}

#[tauri::command]
pub fn detect_sharefile_drives() -> Result<DetectDrivesResponse, String> {
    detection::detect_sharefile_drives().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    config::load_settings(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    config::save_settings(&app, &settings).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_sync(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    state
        .coordinator
        .start(app, settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn request_sync_stop(state: State<'_, AppState>) -> Result<(), String> {
    state
        .coordinator
        .request_stop()
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            coordinator: SyncCoordinator::default(),
        })
        .invoke_handler(tauri::generate_handler![
            detect_sharefile_drives,
            load_settings,
            save_settings,
            start_sync,
            request_sync_stop
        ])
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_title("TeamUpdater V3");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
