use crate::models::AppSettings;
use tauri::AppHandle;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("unable to resolve configuration directory")]
    MissingConfigDir,
    #[error("unable to create configuration directory: {0}")]
    CreateDir(#[from] std::io::Error),
    #[error("unable to parse settings: {0}")]
    Parse(#[from] serde_json::Error),
}

fn settings_path() -> Result<std::path::PathBuf, ConfigError> {
    let base_dir = dirs::config_dir().ok_or(ConfigError::MissingConfigDir)?;
    Ok(base_dir.join("TeamUpdaterV3").join("settings.json"))
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
