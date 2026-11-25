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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Makes a proposed name safe: no path separators, no control characters, no
/// `..`, never empty, at most [`MAX_NAME_LEN`] characters (extension kept).
/// Idempotent: the result of `sanitize_name` is returned unchanged by a second call.
pub fn sanitize_name(raw: &str) -> String {
    // A pass can expose something the next one would clean (truncation may leave
    // only underscores), so repeat until the name stops changing. A pass never
    // lengthens the name, so this ends quickly.
    let mut current = sanitize_pass(raw);
    for _ in 0..8 {
        let next = sanitize_pass(&current);
        if next == current {
            break;
        }
        current = next;
    }
    current
}

fn sanitize_pass(raw: &str) -> String {
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
    let cleaned = cleaned
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .to_string();
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
        let cut: String = name.chars().take(max).collect();
        return cut
            .trim_end_matches(|c: char| c == '.' || c.is_whitespace())
            .to_string();
    }
    let stem: String = name.chars().take(max - ext_len).collect();
    // Cutting must not leave a trailing dot/space (it would meet the extension's
    // dot as `..`, or end the name).
    let stem = stem.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    let stem = if stem.is_empty() { "file" } else { stem };
    format!("{stem}{ext}")
}

/// One save window at a time. Not tied to Tauri so it can be tested alone.
#[derive(Debug, Default)]
pub struct SaveLock(std::sync::atomic::AtomicBool);

/// Held while a save is in progress; releases the lock when dropped.
#[derive(Debug)]
pub struct SavePermit<'a>(&'a SaveLock);

impl SaveLock {
    pub const fn new() -> Self {
        Self(std::sync::atomic::AtomicBool::new(false))
    }

    /// `None` when a save is already in progress.
    pub fn try_acquire(&self) -> Option<SavePermit<'_>> {
        use std::sync::atomic::Ordering;
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| SavePermit(self))
    }
}

impl Drop for SavePermit<'_> {
    fn drop(&mut self) {
        (self.0)
            .0
            .store(false, std::sync::atomic::Ordering::Release);
    }
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
