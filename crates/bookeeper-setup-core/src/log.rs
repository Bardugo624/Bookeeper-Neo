//! The Setup log: `%TEMP%\Bookeeper-Setup.log`, one timestamped line per event.

use crate::sys::System;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const FILE_NAME: &str = "Bookeeper-Setup.log";
/// A log that grew past this is started over, so it never fills the temp folder.
const MAX_BYTES: u64 = 1024 * 1024;

pub struct Log {
    path: PathBuf,
}

impl Log {
    pub fn open(sys: &dyn System) -> Self {
        Self::at(sys.temp_dir().join(FILE_NAME))
    }

    pub fn at(path: PathBuf) -> Self {
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
            let _ = std::fs::remove_file(&path);
        }
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Appends a line. Logging never fails the operation: errors are dropped.
    pub fn line(&self, text: &str) {
        let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        else {
            return;
        };
        let stamp = timestamp(SystemTime::now());
        let text = text.replace(['\r', '\n'], " ");
        let _ = writeln!(f, "{stamp} {text}");
    }

    /// The last `n` lines, newline-separated.
    pub fn tail(&self, n: usize) -> String {
        let Ok(bytes) = std::fs::read(&self.path) else {
            return String::new();
        };
        let text = String::from_utf8_lossy(&bytes);
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(n)..].join("\n")
    }
}

/// `2026-11-27T12:34:56Z` (UTC), without a date library.
fn timestamp(t: SystemTime) -> String {
    let secs = t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let (days, rem) = ((secs / 86_400) as i64, secs % 86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_formats_utc() {
        assert_eq!(timestamp(UNIX_EPOCH), "1970-01-01T00:00:00Z");
        let t = UNIX_EPOCH + std::time::Duration::from_secs(1_795_782_896);
        assert_eq!(timestamp(t), "2026-11-27T12:34:56Z");
    }

    #[test]
    fn lines_append_and_tail_keeps_last() {
        let tmp = tempfile::tempdir().unwrap();
        let log = Log::at(tmp.path().join("l.log"));
        assert_eq!(log.tail(5), "");
        for i in 0..10 {
            log.line(&format!("line {i}\nsecond"));
        }
        let tail = log.tail(3);
        assert_eq!(tail.lines().count(), 3);
        assert!(tail.lines().last().unwrap().ends_with("line 9 second"));
    }
}
