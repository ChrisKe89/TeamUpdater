use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const CUSP_DATA_RELATIVE_PATH: &str = r"Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data";
pub const DEFAULT_DESTINATION_ROOT: &str = r"C:\";

pub const FOLDER_DEFINITIONS: [(&str, bool); 13] = [
    ("CUSPAPPS", true),
    ("TeamCF", false),
    ("TeamDT-A3", false),
    ("TeamDT-A4", false),
    ("TeamGC", false),
    ("TeamHOSG", false),
    ("TeamiGen", false),
    ("TeamOfficeworks", false),
    ("TeamOSB", true),
    ("TeamOSG", false),
    ("TeamPrinters", false),
    ("TeamProduction", false),
    ("TeamWF", false),
];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceMode {
    #[default]
    MappedDrive,
    SharefileApi,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShareFileApiSettings {
    pub tenant_subdomain: String,
    pub root_item_id: Option<String>,
    pub root_display_path: Option<String>,
}

impl Default for ShareFileApiSettings {
    fn default() -> Self {
        Self {
            tenant_subdomain: String::new(),
            root_item_id: None,
            root_display_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub source_mode: SourceMode,
    pub selected_drive: Option<String>,
    pub destination_root: String,
    pub share_file_api: ShareFileApiSettings,
    pub firmware_retention_enabled: bool,
    pub folders: BTreeMap<String, bool>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let folders = FOLDER_DEFINITIONS
            .iter()
            .map(|(key, mandatory)| (key.to_string(), *mandatory))
            .collect();

        Self {
            source_mode: SourceMode::MappedDrive,
            selected_drive: None,
            destination_root: DEFAULT_DESTINATION_ROOT.to_string(),
            share_file_api: ShareFileApiSettings::default(),
            firmware_retention_enabled: false,
            folders,
        }
    }
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        if self.destination_root.trim().is_empty() {
            self.destination_root = DEFAULT_DESTINATION_ROOT.to_string();
        }

        if matches!(self.source_mode, SourceMode::SharefileApi)
            && self.share_file_api.tenant_subdomain.trim().is_empty()
            && self.selected_drive.is_some()
        {
            self.source_mode = SourceMode::MappedDrive;
        }

        self.share_file_api.tenant_subdomain = self.share_file_api.tenant_subdomain.trim().to_string();
        self.share_file_api.root_item_id = self
            .share_file_api
            .root_item_id
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });
        self.share_file_api.root_display_path = self
            .share_file_api
            .root_display_path
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });

        for (key, mandatory) in FOLDER_DEFINITIONS {
            let enabled = self.folders.get(key).copied().unwrap_or(mandatory);
            self.folders
                .insert(key.to_string(), if mandatory { true } else { enabled });
        }

        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlanAction {
    pub action: SyncPlanActionKind,
    pub folder: String,
    pub source_kind: SourceMode,
    pub source_path: Option<String>,
    pub source_item_id: Option<String>,
    pub destination_path: String,
    pub reason: String,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncPlanActionKind {
    Copy,
    Delete,
    SkipDelete,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlanSummary {
    pub copy_count: usize,
    pub delete_count: usize,
    pub skipped_delete_count: usize,
    pub total_copy_bytes: u64,
    pub total_copy_bytes_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlan {
    pub generated_at: String,
    pub source_mode: SourceMode,
    pub selected_drive: Option<String>,
    pub source_root: String,
    pub destination_root: String,
    pub firmware_retention_enabled: bool,
    pub actions: Vec<SyncPlanAction>,
    pub summary: SyncPlanSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveCandidate {
    pub letter: String,
    pub root_path: String,
    pub cusp_data_path: String,
    pub is_reachable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectDrivesResponse {
    pub candidates: Vec<DriveCandidate>,
    pub auto_selected: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncEventScope {
    Preview,
    Sync,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum SyncEvent {
    PreviewStarted {
        message: String,
    },
    PreviewCompleted {
        plan: SyncPlan,
        message: String,
    },
    PreviewStopped {
        message: String,
    },
    PreviewFailed {
        message: String,
    },
    RunStarted {
        message: String,
    },
    ItemProgress {
        display_name: String,
        source_path: String,
        item_progress: f64,
        overall_progress: f64,
        message: String,
    },
    FileCopied {
        destination_path: String,
        total_copied: usize,
        message: String,
    },
    FileDeleted {
        destination_path: String,
        total_deleted: usize,
        message: String,
    },
    RunCompleted {
        summary: SyncSummary,
        message: String,
    },
    RunStopped {
        summary: SyncSummary,
        message: String,
    },
    RunFailed {
        message: String,
    },
    LogLine {
        scope: SyncEventScope,
        line: String,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub copied_files: usize,
    pub deleted_files: usize,
    pub skipped_deletes: usize,
    pub planned_copy_files: usize,
    pub planned_delete_files: usize,
    pub planned_skipped_deletes: usize,
    pub copied_bytes_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAuditRecord {
    pub id: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: RunAuditStatus,
    pub source_mode: SourceMode,
    pub selected_drive: Option<String>,
    pub source_root: Option<String>,
    pub destination_root: String,
    pub enabled_folders: Vec<String>,
    pub firmware_retention_enabled: bool,
    pub summary: SyncSummary,
    pub error_message: Option<String>,
    pub recent_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunAuditStatus {
    Completed,
    Stopped,
    Failed,
}
