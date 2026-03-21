use chrono::Local;
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct SessionLogger {
    file: Arc<Mutex<Option<File>>>,
    path: PathBuf,
}

impl SessionLogger {
    pub fn new() -> Self {
        let path = log_file_path();
        let file = open_log_file(&path);

        let logger = Self {
            file: Arc::new(Mutex::new(file)),
            path,
        };

        logger.log("INFO", format!("Session log started at {}", logger.path.display()));
        logger
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn log(&self, level: &str, message: impl AsRef<str>) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!("[{timestamp}] [{level}] {}\n", message.as_ref());

        if let Ok(mut file_guard) = self.file.lock() {
            if let Some(file) = file_guard.as_mut() {
                let _ = file.write_all(line.as_bytes());
                let _ = file.flush();
            }
        }
    }
}

fn log_file_path() -> PathBuf {
    let logs_dir = log_root_dir().join("Logs");
    let _ = fs::create_dir_all(&logs_dir);

    let filename = format!("{}_logs.txt", Local::now().format("%Y-%m-%d_%H-%M-%S"));
    logs_dir.join(filename)
}

fn log_root_dir() -> PathBuf {
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            return parent.to_path_buf();
        }
    }

    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn open_log_file(path: &Path) -> Option<File> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}
