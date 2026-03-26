use crate::{
    auth::{load_authenticated_client, AuthError},
    detection,
    models::{SourceMode, DEFAULT_DESTINATION_ROOT},
    sharefile_api::{ShareFileApiError, ShareFileClient},
    sharefile_models::ShareFileItem,
};
use chrono::{DateTime, Utc};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use walkdir::WalkDir;

#[derive(Debug, Error)]
pub enum SourceError {
    #[error("no ShareFile drive has been selected")]
    MissingDrive,
    #[error("ShareFile source root does not exist: {0}")]
    MissingSourceRoot(String),
    #[error("ShareFile API root item is not configured")]
    MissingShareFileRoot,
    #[error("source path is outside the expected root")]
    InvalidRelativePath,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("walk error: {0}")]
    Walk(#[from] walkdir::Error),
    #[error("{operation} failed for {path}: {source}")]
    IoWithContext {
        operation: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{0}")]
    Auth(#[from] AuthError),
    #[error("{0}")]
    Api(#[from] ShareFileApiError),
    #[error("operation cancelled")]
    StopRequested,
}

#[derive(Debug, Clone)]
pub struct RemoteFileEntry {
    pub id: Option<String>,
    pub relative_path: PathBuf,
    pub modified_at: Option<SystemTime>,
    pub size_bytes: u64,
    pub source_kind: SourceMode,
    pub source_path: String,
}

pub trait SyncSource: Send + Sync {
    fn mode(&self) -> SourceMode;
    fn selected_drive(&self) -> Option<String> {
        None
    }
    fn describe_root(&self) -> String;
    fn list_enabled_folder_files(
        &self,
        folder_name: &str,
        stop_requested: &AtomicBool,
    ) -> Result<Vec<RemoteFileEntry>, SourceError>;
    fn copy_to_destination(
        &self,
        entry: &RemoteFileEntry,
        destination_path: &Path,
        on_progress: &mut dyn FnMut(u64, Option<u64>) -> Result<(), SourceError>,
    ) -> Result<u64, SourceError>;
}

pub struct MappedDriveSource {
    selected_drive: String,
    source_root: PathBuf,
}

impl MappedDriveSource {
    pub fn from_drive(selected_drive: &str) -> Result<Self, SourceError> {
        let trimmed = selected_drive.trim();
        if trimmed.is_empty() {
            return Err(SourceError::MissingDrive);
        }

        let source_root = detection::build_source_root(trimmed);
        if !source_root.exists() {
            return Err(SourceError::MissingSourceRoot(
                source_root.display().to_string(),
            ));
        }

        Ok(Self {
            selected_drive: trimmed.to_string(),
            source_root,
        })
    }

    #[cfg(test)]
    pub fn from_root_for_tests(selected_drive: &str, source_root: PathBuf) -> Self {
        Self {
            selected_drive: selected_drive.to_string(),
            source_root,
        }
    }
}

impl SyncSource for MappedDriveSource {
    fn mode(&self) -> SourceMode {
        SourceMode::MappedDrive
    }

    fn selected_drive(&self) -> Option<String> {
        Some(self.selected_drive.clone())
    }

    fn describe_root(&self) -> String {
        self.source_root.display().to_string()
    }

    fn list_enabled_folder_files(
        &self,
        folder_name: &str,
        stop_requested: &AtomicBool,
    ) -> Result<Vec<RemoteFileEntry>, SourceError> {
        let source_folder = self.source_root.join(folder_name);
        if !source_folder.exists() {
            return Ok(Vec::new());
        }

        let mut files = Vec::new();
        for entry in WalkDir::new(&source_folder) {
            ensure_not_stopped(stop_requested)?;
            let entry = entry?;
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path().to_path_buf();
            let relative_path = path
                .strip_prefix(&source_folder)
                .map_err(|_| SourceError::InvalidRelativePath)?
                .to_path_buf();
            let metadata = std::fs::metadata(&path)?;

            files.push(RemoteFileEntry {
                id: None,
                relative_path,
                modified_at: metadata.modified().ok(),
                size_bytes: metadata.len(),
                source_kind: SourceMode::MappedDrive,
                source_path: path.display().to_string(),
            });
        }

        files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(files)
    }

    fn copy_to_destination(
        &self,
        entry: &RemoteFileEntry,
        destination_path: &Path,
        on_progress: &mut dyn FnMut(u64, Option<u64>) -> Result<(), SourceError>,
    ) -> Result<u64, SourceError> {
        let source_path = PathBuf::from(&entry.source_path);
        let mut source = fs::File::open(&source_path)
            .map_err(|error| io_error("open file", &source_path, error))?;
        let mut destination = fs::File::create(destination_path)
            .map_err(|error| io_error("create file", destination_path, error))?;
        let total_bytes = source
            .metadata()
            .map_err(|error| io_error("read metadata", &source_path, error))?
            .len();
        let mut transferred = 0_u64;
        let mut buffer = vec![0_u8; 1024 * 256];

        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|error| io_error("read file", &source_path, error))?;
            if read == 0 {
                break;
            }

            destination
                .write_all(&buffer[..read])
                .map_err(|error| io_error("write file", destination_path, error))?;
            transferred += read as u64;
            on_progress(transferred, Some(total_bytes))?;
        }

        destination
            .flush()
            .map_err(|error| io_error("flush file", destination_path, error))?;
        Ok(transferred)
    }
}

pub struct ShareFileApiSource {
    root_item_id: String,
    root_display_path: String,
    client: ShareFileClient,
}

impl ShareFileApiSource {
    pub fn from_settings(root_item_id: Option<&str>, root_display_path: Option<&str>) -> Result<Self, SourceError> {
        let root_item_id = root_item_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or(SourceError::MissingShareFileRoot)?
            .to_string();
        let client = load_authenticated_client()?;
        let root_display_path = root_display_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("/ShareFile")
            .to_string();

        Ok(Self {
            root_item_id,
            root_display_path,
            client,
        })
    }

    fn collect_folder_files(
        &self,
        folder_name: &str,
        stop_requested: &AtomicBool,
    ) -> Result<Vec<RemoteFileEntry>, SourceError> {
        let runtime = tokio::runtime::Runtime::new()?;
        runtime.block_on(async {
            let folder_item = match self
                .client
                .browse_path(&self.root_item_id, &format!("/{folder_name}"))
                .await
            {
                Ok(item) => item,
                Err(ShareFileApiError::MissingItem) => return Ok(Vec::new()),
                Err(error) => return Err(SourceError::Api(error)),
            };

            let mut files = self
                .collect_children_iterative(folder_item, folder_name, stop_requested)
                .await?;
            files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
            Ok(files)
        })
    }

    async fn collect_children_iterative(
        &self,
        folder_item: ShareFileItem,
        folder_name: &str,
        stop_requested: &AtomicBool,
    ) -> Result<Vec<RemoteFileEntry>, SourceError> {
        let mut files = Vec::new();
        let mut stack = vec![(folder_item, PathBuf::new())];

        while let Some((current_folder, relative_root)) = stack.pop() {
            ensure_not_stopped(stop_requested)?;

            for child in self.client.list_children(&current_folder.id).await? {
                ensure_not_stopped(stop_requested)?;
                let child_name = child.display_name();
                let next_relative = relative_root.join(&child_name);

                if child.is_folder() {
                    stack.push((child, next_relative));
                    continue;
                }

                files.push(RemoteFileEntry {
                    id: Some(child.id.clone()),
                    relative_path: next_relative,
                    modified_at: parse_timestamp(child.modification_date.as_deref()),
                    size_bytes: child.file_size_bytes.unwrap_or(0),
                    source_kind: SourceMode::SharefileApi,
                    source_path: child.path.unwrap_or_else(|| {
                        format!("{}/{folder_name}/{}", self.root_display_path, child_name)
                    }),
                });
            }
        }

        Ok(files)
    }
}

impl SyncSource for ShareFileApiSource {
    fn mode(&self) -> SourceMode {
        SourceMode::SharefileApi
    }

    fn describe_root(&self) -> String {
        self.root_display_path.clone()
    }

    fn list_enabled_folder_files(
        &self,
        folder_name: &str,
        stop_requested: &AtomicBool,
    ) -> Result<Vec<RemoteFileEntry>, SourceError> {
        self.collect_folder_files(folder_name, stop_requested)
    }

    fn copy_to_destination(
        &self,
        entry: &RemoteFileEntry,
        destination_path: &Path,
        on_progress: &mut dyn FnMut(u64, Option<u64>) -> Result<(), SourceError>,
    ) -> Result<u64, SourceError> {
        let item_id = entry.id.as_deref().ok_or(SourceError::MissingShareFileRoot)?;
        let runtime = tokio::runtime::Runtime::new()?;

        runtime
            .block_on(self.client.download_file(item_id, destination_path, |written, total| {
                on_progress(written, total).map_err(|error| std::io::Error::other(error.to_string()))
            }))
            .map_err(SourceError::from)
    }
}

pub fn destination_root_or_default(value: &str) -> PathBuf {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        PathBuf::from(DEFAULT_DESTINATION_ROOT)
    } else {
        PathBuf::from(trimmed)
    }
}

fn ensure_not_stopped(stop_requested: &AtomicBool) -> Result<(), SourceError> {
    if stop_requested.load(Ordering::SeqCst) {
        return Err(SourceError::StopRequested);
    }

    Ok(())
}

fn io_error(operation: &'static str, path: &Path, source: std::io::Error) -> SourceError {
    SourceError::IoWithContext {
        operation,
        path: path.display().to_string(),
        source,
    }
}

fn parse_timestamp(value: Option<&str>) -> Option<SystemTime> {
    let parsed = value.and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())?;
    let utc = parsed.with_timezone(&Utc);
    let millis = utc.timestamp_millis();

    if millis >= 0 {
        Some(UNIX_EPOCH + Duration::from_millis(millis as u64))
    } else {
        None
    }
}
