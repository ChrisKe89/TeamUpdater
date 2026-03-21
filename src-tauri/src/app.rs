use crate::{
    config, detection,
    models::{AppSettings, DetectDrivesResponse, RunAuditRecord, SyncPlan},
    sync_engine::{preview_sync, SyncCoordinator},
};
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub coordinator: SyncCoordinator,
}

#[tauri::command]
pub fn detect_sharefile_drives() -> DetectDrivesResponse {
    detection::detect_sharefile_drives()
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
pub fn preview_sync_plan(settings: AppSettings) -> Result<SyncPlan, String> {
    preview_sync(settings).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    state
        .coordinator
        .start_preview(app, settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_run_history(app: AppHandle) -> Result<Vec<RunAuditRecord>, String> {
    config::load_run_history(&app).map_err(|error| error.to_string())
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

#[tauri::command]
pub fn request_preview_stop(state: State<'_, AppState>) -> Result<(), String> {
    state
        .coordinator
        .request_stop()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
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
            preview_sync_plan,
            start_preview,
            load_run_history,
            start_sync,
            request_sync_stop,
            request_preview_stop,
            quit_app
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
