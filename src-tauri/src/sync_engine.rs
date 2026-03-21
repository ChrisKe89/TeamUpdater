use crate::{
    app::AppState, config, detection,
    models::{
        AppSettings, RunAuditRecord, RunAuditStatus, SyncEvent, SyncEventScope, SyncPlan,
        SyncPlanAction, SyncPlanActionKind, SyncPlanSummary, SyncSummary, FOLDER_DEFINITIONS,
    },
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
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;
use walkdir::WalkDir;

const SYNC_EVENT_NAME: &str = "sync://event";
const RECENT_ACTION_LIMIT: usize = 100;

#[derive(Default)]
pub struct SyncCoordinator {
    is_running: Arc<AtomicBool>,
    stop_requested: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}

pub fn preview_sync(settings: AppSettings) -> Result<SyncPlan, SyncError> {
    build_plan_for_job(&settings, &AtomicBool::new(false), None)
}

impl SyncCoordinator {
    pub fn start_preview(&self, app: AppHandle, settings: AppSettings) -> Result<(), SyncError> {
        self.start_worker(move |stop_requested| {
            let normalized = settings.normalized();

            emit(
                &app,
                SyncEvent::PreviewStarted {
                    message: "Preview scan started.".to_string(),
                },
            )
            .ok();
            emit_log(&app, SyncEventScope::Preview, "Preview scan started.".to_string());

            match build_plan_for_job(
                &normalized,
                stop_requested,
                Some((&app, SyncEventScope::Preview)),
            ) {
                Ok(plan) => {
                    emit_log(
                        &app,
                        SyncEventScope::Preview,
                        format!(
                            "Preview ready: {} copies, {} deletes, {} retained.",
                            plan.summary.copy_count,
                            plan.summary.delete_count,
                            plan.summary.skipped_delete_count
                        ),
                    );
                    emit(
                        &app,
                        SyncEvent::PreviewCompleted {
                            plan,
                            message: "Preview scan completed.".to_string(),
                        },
                    )
                    .ok();
                }
                Err(SyncError::StopRequested) => {
                    emit_log(
                        &app,
                        SyncEventScope::Preview,
                        "Preview scan cancelled by operator.".to_string(),
                    );
                    emit(
                        &app,
                        SyncEvent::PreviewStopped {
                            message: "Preview scan cancelled.".to_string(),
                        },
                    )
                    .ok();
                }
                Err(error) => {
                    let message = error.to_string();
                    emit_log(&app, SyncEventScope::Preview, format!("Preview failed: {message}"));
                    let _ = emit(
                        &app,
                        SyncEvent::PreviewFailed {
                            message,
                        },
                    );
                }
            }

            Ok(())
        })
    }

    pub fn start(&self, app: AppHandle, settings: AppSettings) -> Result<(), SyncError> {
        self.start_worker(move |stop_requested| {
            let normalized = settings.normalized();
            let started_at = timestamp_now_ms();
            let selected_drive = normalized.selected_drive.clone();
            let source_root = selected_drive
                .as_ref()
                .map(|drive| detection::build_source_root(drive));

            let result = run_sync(&app, &normalized, stop_requested);

            match result {
                Ok(run_result) => {
                    let _ = config::append_run_history(
                        &app,
                        RunAuditRecord {
                            id: started_at.clone(),
                            started_at,
                            finished_at: timestamp_now_ms(),
                            status: run_result.status,
                            selected_drive,
                            source_root: source_root.map(|path| path.display().to_string()),
                            destination_root: r"C:\".to_string(),
                            enabled_folders: enabled_folders(&normalized),
                            firmware_retention_enabled: normalized.firmware_retention_enabled,
                            summary: run_result.summary,
                            error_message: None,
                            recent_actions: run_result.recent_actions,
                        },
                    );
                }
                Err(error) => {
                    let message = error.to_string();
                    emit_log(&app, SyncEventScope::Sync, format!("Sync failed: {message}"));
                    let _ = emit(
                        &app,
                        SyncEvent::RunFailed {
                            message: message.clone(),
                        },
                    );
                    let _ = config::append_run_history(
                        &app,
                        RunAuditRecord {
                            id: started_at.clone(),
                            started_at,
                            finished_at: timestamp_now_ms(),
                            status: RunAuditStatus::Failed,
                            selected_drive,
                            source_root: source_root.map(|path| path.display().to_string()),
                            destination_root: r"C:\".to_string(),
                            enabled_folders: enabled_folders(&normalized),
                            firmware_retention_enabled: normalized.firmware_retention_enabled,
                            summary: SyncSummary::default(),
                            error_message: Some(message),
                            recent_actions: Vec::new(),
                        },
                    );
                }
            }

            Ok(())
        })
    }

    pub fn request_stop(&self) -> Result<(), SyncError> {
        if !self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.stop_requested.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn start_worker<F>(&self, job: F) -> Result<(), SyncError>
    where
        F: FnOnce(&AtomicBool) -> Result<(), SyncError> + Send + 'static,
    {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Err(SyncError::AlreadyRunning);
        }

        self.stop_requested.store(false, Ordering::SeqCst);
        let stop_requested = Arc::clone(&self.stop_requested);
        let is_running = Arc::clone(&self.is_running);
        let mut worker_slot = self.worker.lock().map_err(|_| SyncError::StatePoisoned)?;

        if let Some(handle) = worker_slot.take() {
            if handle.is_finished() {
                let _ = handle.join();
            } else {
                *worker_slot = Some(handle);
            }
        }

        *worker_slot = Some(thread::spawn(move || {
            let _ = job(&stop_requested);
            is_running.store(false, Ordering::SeqCst);
        }));

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
    #[error("{operation} failed for {path}: {source}")]
    IoWithContext {
        operation: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("walk error: {0}")]
    Walk(#[from] walkdir::Error),
    #[error("source path is outside the expected root")]
    InvalidRelativePath,
    #[error("operation cancelled")]
    StopRequested,
}

struct RunResult {
    status: RunAuditStatus,
    summary: SyncSummary,
    recent_actions: Vec<String>,
}

fn run_sync(
    app: &AppHandle,
    settings: &AppSettings,
    stop_requested: &AtomicBool,
) -> Result<RunResult, SyncError> {
    emit(
        app,
        SyncEvent::RunStarted {
            message: "Sync started.".to_string(),
        },
    )
    .map_err(|error| SyncError::Io(std::io::Error::other(error.to_string())))?;
    emit_log(app, SyncEventScope::Sync, "Sync started.".to_string());
    emit_log(
        app,
        SyncEventScope::Sync,
        "Building sync plan before file operations.".to_string(),
    );

    let plan = match build_plan_for_job(settings, stop_requested, Some((app, SyncEventScope::Sync)))
    {
        Ok(plan) => plan,
        Err(SyncError::StopRequested) => {
            let summary = SyncSummary::default();
            emit_log(
                app,
                SyncEventScope::Sync,
                "Sync cancelled before file operations started.".to_string(),
            );
            emit(
                app,
                SyncEvent::RunStopped {
                    summary: summary.clone(),
                    message: "Sync cancelled.".to_string(),
                },
            )
            .ok();
            return Ok(RunResult {
                status: RunAuditStatus::Stopped,
                summary,
                recent_actions: Vec::new(),
            });
        }
        Err(error) => return Err(error),
    };
    let work_actions = plan
        .actions
        .iter()
        .filter(|action| {
            matches!(
                action.action,
                SyncPlanActionKind::Copy | SyncPlanActionKind::Delete
            )
        })
        .cloned()
        .collect::<Vec<_>>();

    let mut summary = SyncSummary {
        skipped_deletes: plan.summary.skipped_delete_count,
        planned_copy_files: plan.summary.copy_count,
        planned_delete_files: plan.summary.delete_count,
        planned_skipped_deletes: plan.summary.skipped_delete_count,
        ..SyncSummary::default()
    };
    let mut copied_bytes = 0_u64;
    let mut recent_actions = Vec::new();
    let total_work_units = work_actions.len().max(1);

    emit_log(
        app,
        SyncEventScope::Sync,
        format!(
            "Plan ready: {} copies, {} deletes, {} retained.",
            plan.summary.copy_count, plan.summary.delete_count, plan.summary.skipped_delete_count
        ),
    );

    for (action_index, action) in work_actions.iter().enumerate() {
        if stop_requested.load(Ordering::SeqCst) {
            summary.copied_bytes_label = format_bytes(copied_bytes);
            emit_log(
                app,
                SyncEventScope::Sync,
                "Stop requested. Finishing the current operation before exiting.".to_string(),
            );
            emit(
                app,
                SyncEvent::RunStopped {
                    summary: summary.clone(),
                    message: "Sync stopped after the current operation.".to_string(),
                },
            )
            .ok();
            return Ok(RunResult {
                status: RunAuditStatus::Stopped,
                summary,
                recent_actions,
            });
        }

        match action.action {
            SyncPlanActionKind::Copy => {
                let source_path = PathBuf::from(
                    action
                        .source_path
                        .as_ref()
                        .ok_or(SyncError::InvalidRelativePath)?,
                );
                let destination_path = PathBuf::from(&action.destination_path);

                emit(
                    app,
                    SyncEvent::ItemProgress {
                        display_name: source_path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("file")
                            .to_string(),
                        source_path: source_path.display().to_string(),
                        item_progress: 0.0,
                        overall_progress: (action_index as f64 / total_work_units as f64) * 100.0,
                        message: format!("Checking {}", source_path.display()),
                    },
                )
                .ok();

                if let Some(parent) = destination_path.parent() {
                    create_dir_all(parent)?;
                }

                emit_log(
                    app,
                    SyncEventScope::Sync,
                    format!("Copying {} -> {}", source_path.display(), destination_path.display()),
                );
                copied_bytes += copy_file_with_progress(
                    app,
                    &source_path,
                    &destination_path,
                    total_work_units,
                    action_index,
                )?;
                summary.copied_files += 1;
                push_recent_action(
                    &mut recent_actions,
                    format!("Copied {}", destination_path.display()),
                );

                emit(
                    app,
                    SyncEvent::FileCopied {
                        destination_path: destination_path.display().to_string(),
                        total_copied: summary.copied_files,
                        message: format!("Copied {}", destination_path.display()),
                    },
                )
                .ok();
            }
            SyncPlanActionKind::Delete => {
                let destination_path = PathBuf::from(&action.destination_path);

                if destination_path.exists() {
                    emit_log(
                        app,
                        SyncEventScope::Sync,
                        format!("Removing {}", destination_path.display()),
                    );
                    remove_file(&destination_path)?;
                    summary.deleted_files += 1;
                    push_recent_action(
                        &mut recent_actions,
                        format!("Removed {}", destination_path.display()),
                    );
                }

                emit(
                    app,
                    SyncEvent::ItemProgress {
                        display_name: destination_path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("file")
                            .to_string(),
                        source_path: action
                            .source_path
                            .clone()
                            .unwrap_or_else(|| destination_path.display().to_string()),
                        item_progress: 100.0,
                        overall_progress: ((action_index + 1) as f64 / total_work_units as f64)
                            * 100.0,
                        message: format!("Removing {}", destination_path.display()),
                    },
                )
                .ok();

                emit(
                    app,
                    SyncEvent::FileDeleted {
                        destination_path: destination_path.display().to_string(),
                        total_deleted: summary.deleted_files,
                        message: format!("Removed {}", destination_path.display()),
                    },
                )
                .ok();
            }
            SyncPlanActionKind::SkipDelete => {}
        }
    }

    for folder in enabled_folders(settings) {
        ensure_not_stopped(stop_requested)?;
        cleanup_empty_dirs(&PathBuf::from(r"C:\").join(folder))?;
    }

    summary.copied_bytes_label = format_bytes(copied_bytes);
    emit_log(
        app,
        SyncEventScope::Sync,
        format!(
            "Sync complete: {} copied, {} deleted, {} retained.",
            summary.copied_files, summary.deleted_files, summary.skipped_deletes
        ),
    );

    emit(
        app,
        SyncEvent::RunCompleted {
            summary: summary.clone(),
            message: "Sync completed successfully.".to_string(),
        },
    )
    .ok();

    Ok(RunResult {
        status: RunAuditStatus::Completed,
        summary,
        recent_actions,
    })
}

fn build_plan_for_job(
    settings: &AppSettings,
    stop_requested: &AtomicBool,
    event_target: Option<(&AppHandle, SyncEventScope)>,
) -> Result<SyncPlan, SyncError> {
    let normalized = settings.clone().normalized();
    let selected_drive = normalized
        .selected_drive
        .clone()
        .ok_or(SyncError::MissingDrive)?;
    let source_root = detection::build_source_root(&selected_drive);

    build_sync_plan_with_roots(
        &normalized,
        &selected_drive,
        &source_root,
        Path::new(r"C:\"),
        stop_requested,
        event_target,
    )
}

fn build_sync_plan_with_roots(
    settings: &AppSettings,
    selected_drive: &str,
    source_root: &Path,
    destination_root: &Path,
    stop_requested: &AtomicBool,
    event_target: Option<(&AppHandle, SyncEventScope)>,
) -> Result<SyncPlan, SyncError> {
    if !source_root.exists() {
        return Err(SyncError::MissingSourceRoot(
            source_root.display().to_string(),
        ));
    }

    let mut actions = Vec::new();
    let mut summary = SyncPlanSummary::default();

    for folder_name in enabled_folders(settings) {
        ensure_not_stopped(stop_requested)?;
        emit_scoped_log(event_target, format!("Scanning folder {folder_name}"));
        let source_folder = source_root.join(&folder_name);
        let destination_folder = destination_root.join(&folder_name);

        if !source_folder.exists() {
            emit_scoped_log(
                event_target,
                format!("Skipping {folder_name}: source folder not found."),
            );
            continue;
        }

        let source_files = collect_files(&source_folder);
        let mut seen_relative_files = HashSet::new();

        for source_file in source_files {
            ensure_not_stopped(stop_requested)?;
            let relative_path = source_file
                .strip_prefix(&source_folder)
                .map_err(|_| SyncError::InvalidRelativePath)?;
            let destination_file = destination_folder.join(relative_path);

            seen_relative_files.insert(relative_path.to_path_buf());

            if should_copy(&source_file, &destination_file)? {
                let size_bytes = metadata(&source_file)?.len();
                summary.copy_count += 1;
                summary.total_copy_bytes += size_bytes;
                emit_scoped_log(event_target, format!("Queue copy {}", destination_file.display()));
                actions.push(SyncPlanAction {
                    action: SyncPlanActionKind::Copy,
                    folder: folder_name.clone(),
                    source_path: Some(source_file.display().to_string()),
                    destination_path: destination_file.display().to_string(),
                    reason: if destination_file.exists() {
                        "source file is newer or changed".to_string()
                    } else {
                        "file does not exist locally".to_string()
                    },
                    size_bytes: Some(size_bytes),
                });
            }
        }

        for stale_file in collect_stale_files(&destination_folder, &seen_relative_files)? {
            ensure_not_stopped(stop_requested)?;
            if settings.firmware_retention_enabled && is_firmware_path(&stale_file) {
                summary.skipped_delete_count += 1;
                emit_scoped_log(event_target, format!("Retain {}", stale_file.display()));
                actions.push(SyncPlanAction {
                    action: SyncPlanActionKind::SkipDelete,
                    folder: folder_name.clone(),
                    source_path: None,
                    destination_path: stale_file.display().to_string(),
                    reason: "firmware retention is enabled".to_string(),
                    size_bytes: None,
                });
            } else {
                summary.delete_count += 1;
                emit_scoped_log(event_target, format!("Queue delete {}", stale_file.display()));
                actions.push(SyncPlanAction {
                    action: SyncPlanActionKind::Delete,
                    folder: folder_name.clone(),
                    source_path: None,
                    destination_path: stale_file.display().to_string(),
                    reason: "file no longer exists in ShareFile source".to_string(),
                    size_bytes: None,
                });
            }
        }
    }

    summary.total_copy_bytes_label = format_bytes(summary.total_copy_bytes);

    Ok(SyncPlan {
        generated_at: timestamp_now_ms(),
        selected_drive: selected_drive.to_string(),
        source_root: source_root.display().to_string(),
        destination_root: destination_root.display().to_string(),
        firmware_retention_enabled: settings.firmware_retention_enabled,
        actions,
        summary,
    })
}

fn enabled_folders(settings: &AppSettings) -> Vec<String> {
    FOLDER_DEFINITIONS
        .iter()
        .filter_map(|(key, _)| {
            settings
                .folders
                .get(*key)
                .copied()
                .filter(|enabled| *enabled)
                .map(|_| (*key).to_string())
        })
        .collect()
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

fn collect_stale_files(
    destination_root: &Path,
    expected_files: &HashSet<PathBuf>,
) -> Result<Vec<PathBuf>, SyncError> {
    if !destination_root.exists() {
        return Ok(Vec::new());
    }

    let mut stale_files = Vec::new();

    for entry in WalkDir::new(destination_root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let relative_path = entry
            .path()
            .strip_prefix(destination_root)
            .map_err(|_| SyncError::InvalidRelativePath)?
            .to_path_buf();

        if !expected_files.contains(&relative_path) {
            stale_files.push(entry.path().to_path_buf());
        }
    }

    stale_files.sort();
    Ok(stale_files)
}

fn cleanup_empty_dirs(root: &Path) -> Result<(), SyncError> {
    if !root.exists() {
        return Ok(());
    }

    for entry in WalkDir::new(root)
        .contents_first(true)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_dir())
    {
        if entry.path() != root && read_dir(entry.path())?.next().is_none() {
            remove_dir(entry.path())?;
        }
    }

    Ok(())
}

fn should_copy(source_path: &Path, destination_path: &Path) -> Result<bool, SyncError> {
    if !destination_path.exists() {
        return Ok(true);
    }

    let source_metadata = metadata(source_path)?;
    let destination_metadata = metadata(destination_path)?;

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
    total_work_units: usize,
    action_index: usize,
) -> Result<u64, SyncError> {
    let mut source = open_file(source_path)?;
    let mut destination = create_file(destination_path)?;
    let total_bytes = source
        .metadata()
        .map_err(|source_error| io_error("read metadata", source_path, source_error))?
        .len();
    let mut transferred_bytes = 0_u64;
    let mut buffer = vec![0_u8; 1024 * 256];

    loop {
        let read = source
            .read(&mut buffer)
            .map_err(|source_error| io_error("read file", source_path, source_error))?;
        if read == 0 {
            break;
        }

        destination
            .write_all(&buffer[..read])
            .map_err(|source_error| io_error("write file", destination_path, source_error))?;
        transferred_bytes += read as u64;
    }

    destination
        .flush()
        .map_err(|source_error| io_error("flush file", destination_path, source_error))?;
    emit(
        app,
        SyncEvent::ItemProgress {
            display_name: source_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file")
                .to_string(),
            source_path: source_path.display().to_string(),
            item_progress: if total_bytes == 0 || transferred_bytes > 0 {
                100.0
            } else {
                0.0
            },
            overall_progress: ((action_index + 1) as f64 / total_work_units as f64) * 100.0,
            message: format!("Copied {}", source_path.display()),
        },
    )
    .ok();
    Ok(transferred_bytes)
}

fn ensure_not_stopped(stop_requested: &AtomicBool) -> Result<(), SyncError> {
    if stop_requested.load(Ordering::SeqCst) {
        return Err(SyncError::StopRequested);
    }

    Ok(())
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

fn emit_log(app: &AppHandle, scope: SyncEventScope, line: String) {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .logger
            .log("INFO", format!("[{:?}] {line}", scope).to_lowercase());
    }
    let _ = emit(app, SyncEvent::LogLine { scope, line });
}

fn emit_scoped_log(event_target: Option<(&AppHandle, SyncEventScope)>, line: String) {
    if let Some((app, scope)) = event_target {
        emit_log(app, scope, line);
    }
}

fn push_recent_action(actions: &mut Vec<String>, action: String) {
    actions.push(action);
    if actions.len() > RECENT_ACTION_LIMIT {
        actions.remove(0);
    }
}

fn io_error(operation: &'static str, path: &Path, source: std::io::Error) -> SyncError {
    SyncError::IoWithContext {
        operation,
        path: path.display().to_string(),
        source,
    }
}

fn metadata(path: &Path) -> Result<fs::Metadata, SyncError> {
    fs::metadata(path).map_err(|source| io_error("read metadata", path, source))
}

fn create_dir_all(path: &Path) -> Result<(), SyncError> {
    fs::create_dir_all(path).map_err(|source| io_error("create directory", path, source))
}

fn remove_file(path: &Path) -> Result<(), SyncError> {
    fs::remove_file(path).map_err(|source| io_error("remove file", path, source))
}

fn remove_dir(path: &Path) -> Result<(), SyncError> {
    fs::remove_dir(path).map_err(|source| io_error("remove directory", path, source))
}

fn read_dir(path: &Path) -> Result<fs::ReadDir, SyncError> {
    fs::read_dir(path).map_err(|source| io_error("read directory", path, source))
}

fn open_file(path: &Path) -> Result<fs::File, SyncError> {
    fs::File::open(path).map_err(|source| io_error("open file", path, source))
}

fn create_file(path: &Path) -> Result<fs::File, SyncError> {
    fs::File::create(path).map_err(|source| io_error("create file", path, source))
}

fn timestamp_now_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "teamupdater-v3-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0))
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn build_sync_plan_detects_copy_delete_and_skip_delete() {
        let source_root = unique_temp_dir("source");
        let destination_root = unique_temp_dir("destination");

        let source_folder = source_root.join("CUSPAPPS");
        let destination_folder = destination_root.join("CUSPAPPS");
        fs::create_dir_all(source_folder.join("sub")).expect("source folder");
        fs::create_dir_all(destination_folder.join("Firmware")).expect("destination folder");

        fs::write(source_folder.join("sub").join("app.txt"), "new file").expect("source file");
        fs::write(destination_folder.join("orphan.txt"), "stale").expect("stale file");
        fs::write(
            destination_folder.join("Firmware").join("keep.bin"),
            "firmware",
        )
        .expect("firmware file");

        let settings = AppSettings::default();
        let plan = build_sync_plan_with_roots(
            &settings,
            "Z",
            &source_root,
            &destination_root,
            &AtomicBool::new(false),
            None,
        )
        .expect("build plan");

        assert_eq!(plan.summary.copy_count, 1);
        assert_eq!(plan.summary.delete_count, 2);

        let retained_settings = AppSettings {
            firmware_retention_enabled: true,
            ..AppSettings::default()
        };
        let retained_plan = build_sync_plan_with_roots(
            &retained_settings,
            "Z",
            &source_root,
            &destination_root,
            &AtomicBool::new(false),
            None,
        )
        .expect("build retained plan");

        assert_eq!(retained_plan.summary.copy_count, 1);
        assert_eq!(retained_plan.summary.delete_count, 1);
        assert_eq!(retained_plan.summary.skipped_delete_count, 1);
        assert!(retained_plan.actions.iter().any(|action| {
            matches!(action.action, SyncPlanActionKind::SkipDelete)
                && action.destination_path.ends_with(r"Firmware\keep.bin")
        }));

        let _ = fs::remove_dir_all(source_root);
        let _ = fs::remove_dir_all(destination_root);
    }

    #[test]
    fn should_copy_when_source_is_newer_or_size_changes() {
        let root = unique_temp_dir("copy-check");
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");

        fs::write(&source, "abc").expect("source");
        assert!(should_copy(&source, &destination).expect("missing destination"));

        fs::write(&destination, "abcd").expect("destination");
        assert!(should_copy(&source, &destination).expect("size mismatch"));

        fs::write(&destination, "abc").expect("destination same size");
        assert!(!should_copy(&source, &destination).expect("same file"));

        std::thread::sleep(Duration::from_millis(10));
        fs::write(&source, "abc").expect("source updated");
        assert!(should_copy(&source, &destination).expect("source newer"));

        let _ = fs::remove_dir_all(root);
    }
}
