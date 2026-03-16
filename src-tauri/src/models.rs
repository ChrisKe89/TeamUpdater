use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const CUSP_DATA_RELATIVE_PATH: &str = r"Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data";

pub const FOLDER_DEFINITIONS: [(&str, bool); 16] = [
    ("_gsdata_", false),
    ("CUSP Tool Installer", false),
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
    ("Temp", false),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub selected_drive: Option<String>,
    pub firmware_retention_enabled: bool,
    pub folders: BTreeMap<String, bool>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let folders = FOLDER_DEFINITIONS
            .iter()
            .map(|(key, mandatory)| {
                let enabled = *mandatory || *key != "_gsdata_";
                (key.to_string(), enabled)
            })
            .collect();

        Self {
            selected_drive: None,
            firmware_retention_enabled: false,
            folders,
        }
    }
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        for (key, mandatory) in FOLDER_DEFINITIONS {
            let enabled = self
                .folders
                .get(key)
                .copied()
                .unwrap_or(mandatory || key != "_gsdata_");
            self.folders
                .insert(key.to_string(), if mandatory { true } else { enabled });
        }

        self
    }
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum SyncEvent {
    RunStarted { message: String },
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
    RunCompleted { summary: SyncSummary, message: String },
    RunStopped { summary: SyncSummary, message: String },
    RunFailed { message: String },
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub copied_files: usize,
    pub deleted_files: usize,
    pub skipped_deletes: usize,
    pub copied_bytes_label: String,
}
