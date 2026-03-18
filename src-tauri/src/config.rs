use crate::models::{AppSettings, RunAuditRecord};
use tauri::AppHandle;
use thiserror::Error;

const APP_DIR_NAME: &str = "TeamUpdaterV3";
const MAX_HISTORY_RECORDS: usize = 100;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("unable to resolve configuration directory")]
    MissingConfigDir,
    #[error("unable to resolve data directory")]
    MissingDataDir,
    #[error("unable to create configuration directory: {0}")]
    CreateDir(#[from] std::io::Error),
    #[error("unable to parse settings: {0}")]
    Parse(#[from] serde_json::Error),
}

fn settings_path() -> Result<std::path::PathBuf, ConfigError> {
    let base_dir = dirs::config_dir().ok_or(ConfigError::MissingConfigDir)?;
    Ok(base_dir.join(APP_DIR_NAME).join("settings.json"))
}

fn history_path() -> Result<std::path::PathBuf, ConfigError> {
    let base_dir = dirs::data_local_dir().ok_or(ConfigError::MissingDataDir)?;
    Ok(base_dir.join(APP_DIR_NAME).join("run-history.json"))
}

pub fn load_settings(_app: &AppHandle) -> Result<AppSettings, ConfigError> {
    let path = settings_path()?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = std::fs::read_to_string(path)?;
    let settings = serde_json::from_str::<AppSettings>(&content)?;
    Ok(settings.normalized())
}

pub fn save_settings(_app: &AppHandle, settings: &AppSettings) -> Result<(), ConfigError> {
    let path = settings_path()?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let serialized = serde_json::to_string_pretty(&settings.clone().normalized())?;
    std::fs::write(path, serialized)?;
    Ok(())
}

pub fn load_run_history(_app: &AppHandle) -> Result<Vec<RunAuditRecord>, ConfigError> {
    let path = history_path()?;

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(path)?;
    let history = serde_json::from_str::<Vec<RunAuditRecord>>(&content)?;
    Ok(history)
}

pub fn append_run_history(_app: &AppHandle, record: RunAuditRecord) -> Result<(), ConfigError> {
    let path = history_path()?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut history = if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str::<Vec<RunAuditRecord>>(&content)?
    } else {
        Vec::new()
    };

    history.insert(0, record);
    history.truncate(MAX_HISTORY_RECORDS);

    let serialized = serde_json::to_string_pretty(&history)?;
    std::fs::write(path, serialized)?;
    Ok(())
}
