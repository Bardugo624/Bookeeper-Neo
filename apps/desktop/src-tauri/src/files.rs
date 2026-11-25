//! Saving files the app produced, through the system "Save as" window.
//!
//! The window and the command are in `lib.rs`; everything that does not need a
//! window lives here as plain functions.

use std::io::Write;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};

/// Longest proposed file name, in characters.
pub const MAX_NAME_LEN: usize = 120;

#[derive(Debug, Clone, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SaveOutcome {
    pub saved: bool,
    pub path: Option<String>,
}

/// Makes a proposed name safe: no path separators, no control characters, no
/// `..`, never empty, at most [`MAX_NAME_LEN`] characters (extension kept).
pub fn sanitize_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim().to_string();
    // A run of dots inside the name is never meaningful and `..` must not survive.
    let mut name = cleaned;
    while name.contains("..") {
        name = name.replace("..", ".");
    }
    if name.is_empty() || name.chars().all(|c| c == '_') {
        return "file".into();
    }
    truncate_keeping_extension(&name, MAX_NAME_LEN)
}

fn truncate_keeping_extension(name: &str, max: usize) -> String {
    let len = name.chars().count();
    if len <= max {
        return name.to_string();
    }
    let ext = match name.rfind('.') {
        Some(i) if i > 0 => &name[i..],
        _ => "",
    };
    let ext_len = ext.chars().count();
    // An absurdly long "extension" is just part of the name.
    if ext_len >= max {
        return name.chars().take(max).collect();
    }
    let stem: String = name.chars().take(max - ext_len).collect();
    format!("{stem}{ext}")
}

pub fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("invalid base64: {e}"))
}

/// Writes `bytes` to `path`: temporary file in the same folder, then rename.
/// When the rename is not possible the bytes are written directly. An existing
/// file is replaced.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let tmp = dir.join(format!(".bookeeper-{}.tmp", uuid::Uuid::now_v7()));
    let staged = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()
    })();
    if staged.is_ok() && std::fs::rename(&tmp, path).is_ok() {
        return Ok(());
    }
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// Decodes first, so invalid input never creates a file.
pub fn save_to(path: &Path, bytes_base64: &str) -> Result<SaveOutcome, String> {
    let bytes = decode_base64(bytes_base64)?;
    write_atomic(path, &bytes)?;
    Ok(SaveOutcome {
        saved: true,
        path: Some(path.display().to_string()),
    })
}

/// Splits the web-side extension lists into what the dialog wants.
pub fn filter_parts(f: &FileFilter) -> (String, Vec<String>) {
    let exts = f
        .extensions
        .iter()
        .map(|e| e.trim().trim_start_matches('.').to_string())
        .filter(|e| !e.is_empty())
        .collect();
    (f.name.clone(), exts)
}

pub fn path_of(p: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
    p.into_path().ok()
}
