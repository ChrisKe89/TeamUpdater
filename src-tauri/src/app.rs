use crate::{
    auth,
    config, detection,
    logger::SessionLogger,
    models::{AppSettings, DetectDrivesResponse, RunAuditRecord, SyncPlan},
    sharefile_models::{
        ShareFileAuthConfig, ShareFileAuthSession, ShareFileAuthStatus, ShareFileBrowseNode,
    },
    sync_engine::{preview_sync, SyncCoordinator},
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
pub fn get_sharefile_auth_status() -> Result<ShareFileAuthStatus, String> {
    auth::get_sharefile_auth_status().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn begin_sharefile_auth(
    config: ShareFileAuthConfig,
) -> Result<ShareFileAuthSession, String> {
    auth::begin_sharefile_auth(config).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn complete_sharefile_auth(callback_url: String) -> Result<ShareFileAuthStatus, String> {
    auth::complete_sharefile_auth(&callback_url).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_sharefile_root_items() -> Result<Vec<ShareFileBrowseNode>, String> {
    let client = auth::load_authenticated_client().map_err(|error| error.to_string())?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;

    runtime
        .block_on(async move {
            let items = client.list_children("home").await?;
            Ok::<Vec<ShareFileBrowseNode>, crate::sharefile_api::ShareFileApiError>(
                items
                    .into_iter()
                    .filter(|item| item.is_folder())
                    .map(|item| item.to_browse_node())
                    .collect(),
            )
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browse_sharefile_folder(parent_id: String) -> Result<Vec<ShareFileBrowseNode>, String> {
    let client = auth::load_authenticated_client().map_err(|error| error.to_string())?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;

    runtime
        .block_on(async move {
            let items = client.list_children(&parent_id).await?;
            Ok::<Vec<ShareFileBrowseNode>, crate::sharefile_api::ShareFileApiError>(
                items
                    .into_iter()
                    .filter(|item| item.is_folder())
                    .map(|item| item.to_browse_node())
                    .collect(),
            )
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn disconnect_sharefile_account() -> Result<(), String> {
    auth::disconnect_sharefile_account().map_err(|error| error.to_string())
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
            load_settings,
            save_settings,
            preview_sync_plan,
            start_preview,
            load_run_history,
            start_sync,
            request_sync_stop,
            request_preview_stop,
            get_sharefile_auth_status,
            begin_sharefile_auth,
            complete_sharefile_auth,
            list_sharefile_root_items,
            browse_sharefile_folder,
            disconnect_sharefile_account,
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
