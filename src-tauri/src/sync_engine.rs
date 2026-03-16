use crate::{
    detection,
    models::{AppSettings, SyncEvent, SyncSummary, FOLDER_DEFINITIONS},
};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::SystemTime,
};
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use walkdir::WalkDir;

const SYNC_EVENT_NAME: &str = "sync://event";

#[derive(Default)]
pub struct SyncCoordinator {
    is_running: Arc<AtomicBool>,
    stop_requested: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}

impl SyncCoordinator {
    pub fn start(&self, app: AppHandle, settings: AppSettings) -> Result<(), SyncError> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Err(SyncError::AlreadyRunning);
        }

        self.stop_requested.store(false, Ordering::SeqCst);
        let stop_requested = Arc::clone(&self.stop_requested);
        let is_running = Arc::clone(&self.is_running);
        let mut worker_slot = self.worker.lock().map_err(|_| SyncError::StatePoisoned)?;

        *worker_slot = Some(thread::spawn(move || {
            let normalized = settings.normalized();
            let result = run_sync(&app, &normalized, &stop_requested);

            if let Err(error) = result {
                let _ = emit(
                    &app,
                    SyncEvent::RunFailed {
                        message: error.to_string(),
                    },
                );
            }

            is_running.store(false, Ordering::SeqCst);
        }));

        Ok(())
    }

    pub fn request_stop(&self) -> Result<(), SyncError> {
        if !self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.stop_requested.store(true, Ordering::SeqCst);
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("a sync run is already in progress")]
    AlreadyRunning,
    #[error("sync state is unavailable")]
    StatePoisoned,
    #[error("no ShareFile drive has been selected")]
    MissingDrive,
    #[error("ShareFile source root does not exist: {0}")]
    MissingSourceRoot(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("walk error: {0}")]
    Walk(#[from] walkdir::Error),
    #[error("source path is outside the expected root")]
    InvalidRelativePath,
}

fn run_sync(
    app: &AppHandle,
    settings: &AppSettings,
    stop_requested: &AtomicBool,
) -> Result<(), SyncError> {
    emit(
        app,
        SyncEvent::RunStarted {
            message: "Sync started.".to_string(),
        },
    )
    .map_err(|error| SyncError::Io(std::io::Error::other(error.to_string())))?;

    let selected_drive = settings
        .selected_drive
        .clone()
        .ok_or(SyncError::MissingDrive)?;
    let source_root = detection::build_source_root(&selected_drive);

    if !source_root.exists() {
        return Err(SyncError::MissingSourceRoot(source_root.display().to_string()));
    }

    let enabled_folders: Vec<&str> = FOLDER_DEFINITIONS
        .iter()
        .filter_map(|(key, _)| {
            settings
                .folders
                .get(*key)
                .copied()
                .filter(|enabled| *enabled)
                .map(|_| *key)
        })
        .collect();

    let total_work_units = enabled_folders.len().max(1);
    let mut summary = SyncSummary::default();
    let mut copied_bytes = 0_u64;

    for (folder_index, folder_name) in enabled_folders.iter().enumerate() {
        if stop_requested.load(Ordering::SeqCst) {
            summary.copied_bytes_label = format_bytes(copied_bytes);
            emit(
                app,
                SyncEvent::RunStopped {
                    summary,
                    message: "Sync stopped after the current operation.".to_string(),
                },
            )
            .ok();
            return Ok(());
        }

        let source_folder = source_root.join(folder_name);
        let destination_folder = PathBuf::from(r"C:\").join(folder_name);

        if !source_folder.exists() {
          continue;
        }

        fs::create_dir_all(&destination_folder)?;
        let source_files = collect_files(&source_folder);
        let file_total = source_files.len().max(1);
        let mut seen_relative_files = HashSet::new();

        for (file_index, source_file) in source_files.iter().enumerate() {
            let relative_path = source_file
                .strip_prefix(&source_folder)
                .map_err(|_| SyncError::InvalidRelativePath)?;
            let destination_file = destination_folder.join(relative_path);
            let display_name = source_file
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file")
                .to_string();

            seen_relative_files.insert(relative_path.to_path_buf());
            let overall_progress = ((folder_index as f64)
                + ((file_index as f64) / (file_total as f64)))
                / (total_work_units as f64)
                * 100.0;

            emit(
                app,
                SyncEvent::ItemProgress {
                    display_name,
                    source_path: source_file.display().to_string(),
                    item_progress: 0.0,
                    overall_progress,
                    message: format!("Checking {}", source_file.display()),
                },
            )
            .ok();

            if should_copy(source_file, &destination_file)? {
                if let Some(parent) = destination_file.parent() {
                    fs::create_dir_all(parent)?;
                }

                copied_bytes += copy_file_with_progress(
                    app,
                    source_file,
                    &destination_file,
                    file_total,
                    file_index,
                    folder_index,
                    total_work_units,
                )?;
                summary.copied_files += 1;

                emit(
                    app,
                    SyncEvent::FileCopied {
                        destination_path: destination_file.display().to_string(),
                        total_copied: summary.copied_files,
                        message: format!("Copied {}", destination_file.display()),
                    },
                )
                .ok();
            }

            if stop_requested.load(Ordering::SeqCst) {
                summary.copied_bytes_label = format_bytes(copied_bytes);
                emit(
                    app,
                    SyncEvent::RunStopped {
                        summary,
                        message: "Sync stopped after the current operation.".to_string(),
                    },
                )
                .ok();
                return Ok(());
            }
        }

        let (stale_entries, skipped_deletes) = collect_stale_entries(
            &destination_folder,
            &seen_relative_files,
            settings.firmware_retention_enabled,
        )?;
        summary.skipped_deletes += skipped_deletes;

        for stale_entry in stale_entries {
            if stop_requested.load(Ordering::SeqCst) {
                summary.copied_bytes_label = format_bytes(copied_bytes);
                emit(
                    app,
                    SyncEvent::RunStopped {
                        summary,
                        message: "Sync stopped after the current operation.".to_string(),
                    },
                )
                .ok();
                return Ok(());
            }

            if stale_entry.is_dir() {
                fs::remove_dir_all(&stale_entry)?;
            } else {
                fs::remove_file(&stale_entry)?;
                summary.deleted_files += 1;
                emit(
                    app,
                    SyncEvent::FileDeleted {
                        destination_path: stale_entry.display().to_string(),
                        total_deleted: summary.deleted_files,
                        message: format!("Removed {}", stale_entry.display()),
                    },
                )
                .ok();
            }
        }
    }

    summary.copied_bytes_label = format_bytes(copied_bytes);

    emit(
        app,
        SyncEvent::RunCompleted {
            summary,
            message: "Sync completed successfully.".to_string(),
        },
    )
    .ok();

    Ok(())
}

fn collect_files(root: &Path) -> Vec<PathBuf> {
    let mut files = WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.path().to_path_buf())
        .collect::<Vec<_>>();

    files.sort();
    files
}

fn collect_stale_entries(
    destination_root: &Path,
    expected_files: &HashSet<PathBuf>,
    firmware_retention_enabled: bool,
) -> Result<(Vec<PathBuf>, usize), SyncError> {
    let mut stale_entries = Vec::new();
    let mut skipped_deletes = 0;

    for entry in WalkDir::new(destination_root)
        .contents_first(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path == destination_root {
            continue;
        }

        if firmware_retention_enabled && is_firmware_path(path) {
            if entry.file_type().is_file() {
                skipped_deletes += 1;
            }
            continue;
        }

        let relative_path = path
            .strip_prefix(destination_root)
            .map_err(|_| SyncError::InvalidRelativePath)?
            .to_path_buf();

        if entry.file_type().is_file() && !expected_files.contains(&relative_path) {
            stale_entries.push(path.to_path_buf());
        }

        if entry.file_type().is_dir() && fs::read_dir(path)?.next().is_none() {
            stale_entries.push(path.to_path_buf());
        }
    }

    Ok((stale_entries, skipped_deletes))
}

fn should_copy(source_path: &Path, destination_path: &Path) -> Result<bool, SyncError> {
    if !destination_path.exists() {
        return Ok(true);
    }

    let source_metadata = fs::metadata(source_path)?;
    let destination_metadata = fs::metadata(destination_path)?;

    if source_metadata.len() != destination_metadata.len() {
        return Ok(true);
    }

    let source_modified = source_metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let destination_modified = destination_metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH);

    Ok(source_modified > destination_modified)
}

fn copy_file_with_progress(
    app: &AppHandle,
    source_path: &Path,
    destination_path: &Path,
    file_total: usize,
    file_index: usize,
    folder_index: usize,
    total_work_units: usize,
) -> Result<u64, SyncError> {
    let mut source = fs::File::open(source_path)?;
    let mut destination = fs::File::create(destination_path)?;
    let total_bytes = source.metadata()?.len();
    let mut transferred_bytes = 0_u64;
    let mut buffer = vec![0_u8; 1024 * 256];

    loop {
        let read = source.read(&mut buffer)?;
        if read == 0 {
            break;
        }

        destination.write_all(&buffer[..read])?;
        transferred_bytes += read as u64;

        let item_progress = if total_bytes == 0 {
            100.0
        } else {
            (transferred_bytes as f64 / total_bytes as f64) * 100.0
        };

        let base_progress = ((folder_index as f64)
            + ((file_index as f64) / (file_total.max(1) as f64)))
            / (total_work_units as f64);
        let overall_progress =
            (base_progress + (item_progress / 100.0) / total_work_units as f64) * 100.0;

        emit(
            app,
            SyncEvent::ItemProgress {
                display_name: source_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("file")
                    .to_string(),
                source_path: source_path.display().to_string(),
                item_progress,
                overall_progress,
                message: format!("Copying {}", source_path.display()),
            },
        )
        .ok();
    }

    destination.flush()?;
    Ok(transferred_bytes)
}

fn is_firmware_path(path: &Path) -> bool {
    path.components().any(|component| match component {
        Component::Normal(value) => value
            .to_str()
            .map(|value| value.eq_ignore_ascii_case("Firmware"))
            .unwrap_or(false),
        _ => false,
    })
}

fn emit(app: &AppHandle, event: SyncEvent) -> tauri::Result<()> {
    app.emit(SYNC_EVENT_NAME, event)
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let bytes_f = bytes as f64;

    if bytes_f >= GB {
        format!("{:.2} GB copied", bytes_f / GB)
    } else if bytes_f >= MB {
        format!("{:.2} MB copied", bytes_f / MB)
    } else if bytes_f >= KB {
        format!("{:.2} KB copied", bytes_f / KB)
    } else {
        format!("{bytes} bytes copied")
    }
}
