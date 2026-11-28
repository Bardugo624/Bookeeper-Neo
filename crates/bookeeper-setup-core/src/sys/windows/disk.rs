//! Free space, network paths and write probes.

use std::io;
use std::path::{Path, PathBuf};

use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW};

use super::wide;

// `DRIVE_REMOTE` lives behind a feature we do not otherwise need.
const DRIVE_REMOTE: u32 = 4;

/// Free bytes available to the user on the drive holding `path` (which may not exist yet).
pub fn free_space(path: &Path) -> io::Result<u64> {
    let mut probe: &Path = path;
    while !probe.exists() {
        match probe.parent() {
            Some(p) if !p.as_os_str().is_empty() => probe = p,
            _ => break,
        }
    }
    let w = wide::to_wide(probe.as_os_str());
    let mut avail = 0u64;
    let (mut total, mut free) = (0u64, 0u64);
    // SAFETY: `w` is NUL-terminated and the out pointers are valid.
    let ok = unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut avail, &mut total, &mut free) };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(avail)
}

pub fn is_network_path(path: &Path) -> bool {
    let s = path.as_os_str().to_string_lossy().replace('/', "\\");
    if s.to_ascii_lowercase().starts_with(r"\\?\unc\") {
        return true;
    }
    if s.starts_with(r"\\?\") || s.starts_with(r"\\.\") {
        // Verbatim path to a drive letter: judge by the drive.
        return drive_is_remote(&s[4..]);
    }
    if s.starts_with(r"\\") {
        return true;
    }
    drive_is_remote(&s)
}

fn drive_is_remote(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 2 || !b[0].is_ascii_alphabetic() || b[1] != b':' {
        return false;
    }
    let root = format!("{}:\\", b[0] as char);
    let w = wide::to_wide(root.as_ref());
    // SAFETY: `w` is NUL-terminated.
    unsafe { GetDriveTypeW(w.as_ptr()) == DRIVE_REMOTE }
}

/// Creates missing folders, writes and deletes a probe file, then removes only the folders
/// it created. `Ok(false)` means access was denied.
pub fn can_write(dir: &Path) -> io::Result<bool> {
    let mut missing: Vec<PathBuf> = Vec::new();
    let mut cur = Some(dir);
    while let Some(p) = cur {
        if p.as_os_str().is_empty() || p.exists() {
            break;
        }
        missing.push(p.to_path_buf());
        cur = p.parent();
    }
    let result = (|| {
        std::fs::create_dir_all(dir)?;
        let probe = dir.join(format!(".bookeeper-write-test-{}", std::process::id()));
        std::fs::write(&probe, b"x")?;
        std::fs::remove_file(&probe)
    })();
    for p in &missing {
        // Deepest first; `missing` was built from the leaf upwards.
        let _ = std::fs::remove_dir(p);
    }
    match result {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => Ok(false),
        Err(e) => Err(e),
    }
}
