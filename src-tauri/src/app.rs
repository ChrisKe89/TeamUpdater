use crate::{
    config, detection,
    logger::SessionLogger,
    models::{AppSettings, DetectDrivesResponse, RunAuditRecord},
    sync_engine::SyncCoordinator,
};
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub coordinator: SyncCoordinator,
    pub logger: SessionLogger,
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
pub fn request_stop(state: State<'_, AppState>) -> Result<(), String> {
    state
        .coordinator
        .request_stop()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppState>() {
        state.logger.log("INFO", "Quit requested by operator.");
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn write_client_log(
    state: State<'_, AppState>,
    level: String,
    message: String,
) -> Result<(), String> {
    let trimmed_level = level.trim().to_uppercase();
    let trimmed_message = message.trim();

    if trimmed_message.is_empty() {
        return Ok(());
    }

    state
        .logger
        .log(trimmed_level.as_str(), format!("CLIENT {}", trimmed_message));
    Ok(())
}

#[tauri::command]
pub fn get_folder_definitions() -> Vec<crate::models::FolderDefinition> {
    crate::models::FOLDER_DEFINITIONS
        .iter()
        .map(|(key, mandatory)| crate::models::FolderDefinition {
            key: key.to_string(),
            is_mandatory: *mandatory,
        })
        .collect()
}

pub fn run() {
    let logger = SessionLogger::new();
    logger.log("INFO", "Initializing TeamUpdater V3.");

    let panic_logger = logger.clone();
    std::panic::set_hook(Box::new(move |panic_info| {
        panic_logger.log("PANIC", panic_info.to_string());
    }));

    tauri::Builder::default()
        .manage(AppState {
            coordinator: SyncCoordinator::default(),
            logger,
        })
        .invoke_handler(tauri::generate_handler![
            detect_sharefile_drives,
            get_folder_definitions,
            load_settings,
            save_settings,
            start_preview,
            load_run_history,
            start_sync,
            request_stop,
            write_client_log,
            quit_app
        ])
        .setup(|app| {
            if let Some(state) = app.try_state::<AppState>() {
                state.logger.log(
                    "INFO",
                    format!("Desktop session ready. Logs: {}", state.logger.path().display()),
                );
            }

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_title("TeamUpdater V3");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
