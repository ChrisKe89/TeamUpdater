use crate::models::{DetectDrivesResponse, DriveCandidate, CUSP_DATA_RELATIVE_PATH};
use std::{fs, path::PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DetectionError {
    #[error("failed to read system drive letters")]
    ReadDrives,
}

pub fn detect_sharefile_drives() -> Result<DetectDrivesResponse, DetectionError> {
    let mut candidates = Vec::new();

    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\", letter as char);
        let root = PathBuf::from(&drive);

        if !root.exists() {
            continue;
        }

        let cusp_data_path = root.join(CUSP_DATA_RELATIVE_PATH);
        let is_reachable = fs::metadata(&cusp_data_path).is_ok();

        if is_reachable {
            candidates.push(DriveCandidate {
                letter: (letter as char).to_string(),
                root_path: drive,
                cusp_data_path: cusp_data_path.display().to_string(),
                is_reachable,
            });
        }
    }

    let auto_selected = if candidates.len() == 1 {
        candidates.first().map(|candidate| candidate.letter.clone())
    } else {
        None
    };

    Ok(DetectDrivesResponse {
        candidates,
        auto_selected,
    })
}

pub fn build_source_root(drive_letter: &str) -> PathBuf {
    PathBuf::from(format!("{drive_letter}:\\")).join(CUSP_DATA_RELATIVE_PATH)
}
