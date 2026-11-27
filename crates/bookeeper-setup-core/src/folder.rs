//! Choosing the install folder: target naming, path rules, space checks.

use std::path::{Path, PathBuf};

pub const SPACE_MARGIN: u64 = 50 * 1024 * 1024;
pub const MAX_PATH_CHARS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderProblem {
    NotAbsolute,
    Network,
    NeedsAdmin,
    TooLong,
    TooLittleSpace { free: u64 },
    TempTooSmall { free: u64 },
}

/// Appends `Bookeeper` unless the chosen folder already has that name (any case)
/// or is empty. Works on the text, so Windows paths behave the same on any host.
pub fn target_for_choice(chosen: &Path, chosen_is_empty: bool) -> PathBuf {
    let s = chosen.to_string_lossy();
    let trimmed = s.trim_end_matches(['\\', '/']);
    let last = trimmed.rsplit(['\\', '/']).next().unwrap_or("");
    if chosen_is_empty || last.eq_ignore_ascii_case("Bookeeper") {
        return chosen.to_path_buf();
    }
    let sep = if trimmed.contains('\\') || !trimmed.contains('/') {
        '\\'
    } else {
        '/'
    };
    PathBuf::from(format!("{trimmed}{sep}Bookeeper"))
}

/// Rules that need no disk access: absolute local path, not too long.
pub fn check_path(dir: &Path) -> Option<FolderProblem> {
    let s = dir.to_string_lossy();
    if s.starts_with("\\\\") || s.starts_with("//") {
        return Some(FolderProblem::Network);
    }
    let b = s.as_bytes();
    let drive_abs = b.len() >= 3
        && b[0].is_ascii_alphabetic()
        && b[1] == b':'
        && (b[2] == b'\\' || b[2] == b'/');
    if !drive_abs {
        return Some(FolderProblem::NotAbsolute);
    }
    if s.chars().count() > MAX_PATH_CHARS {
        return Some(FolderProblem::TooLong);
    }
    None
}

/// The target disk needs `installed_bytes` plus a margin; the temp disk the installer's size.
pub fn check_space(
    free_target: u64,
    free_temp: u64,
    installed_bytes: u64,
    payload_bytes: u64,
) -> Option<FolderProblem> {
    if free_target < installed_bytes.saturating_add(SPACE_MARGIN) {
        return Some(FolderProblem::TooLittleSpace { free: free_target });
    }
    if free_temp < payload_bytes {
        return Some(FolderProblem::TempTooSmall { free: free_temp });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_appends_bookeeper_to_non_empty_folder() {
        assert_eq!(
            target_for_choice(Path::new(r"C:\Users\Mario Rossi\Documenti"), false),
            PathBuf::from(r"C:\Users\Mario Rossi\Documenti\Bookeeper")
        );
        assert_eq!(
            target_for_choice(Path::new(r"D:\Libri\"), false),
            PathBuf::from(r"D:\Libri\Bookeeper")
        );
        assert_eq!(
            target_for_choice(Path::new("/home/a"), false),
            PathBuf::from("/home/a/Bookeeper")
        );
        assert_eq!(
            target_for_choice(Path::new(r"C:\Vuota"), true),
            PathBuf::from(r"C:\Vuota")
        );
    }

    #[test]
    fn target_keeps_folder_named_bookeeper() {
        assert_eq!(
            target_for_choice(Path::new(r"C:\App\Bookeeper"), false),
            PathBuf::from(r"C:\App\Bookeeper")
        );
        assert_eq!(
            target_for_choice(Path::new(r"C:\App\bookeeper"), false),
            PathBuf::from(r"C:\App\bookeeper")
        );
    }

    #[test]
    fn check_space_margin_and_temp() {
        let mb = 1024 * 1024;
        assert_eq!(check_space(91 * mb, 100 * mb, 41 * mb, 30 * mb), None);
        assert_eq!(
            check_space(91 * mb - 1, 100 * mb, 41 * mb, 30 * mb),
            Some(FolderProblem::TooLittleSpace { free: 91 * mb - 1 })
        );
        assert_eq!(
            check_space(500 * mb, 30 * mb - 1, 41 * mb, 30 * mb),
            Some(FolderProblem::TempTooSmall { free: 30 * mb - 1 })
        );
        assert_eq!(check_space(500 * mb, 30 * mb, 41 * mb, 30 * mb), None);
    }

    #[test]
    fn check_path_rules() {
        assert_eq!(check_path(Path::new(r"C:\Users\x\Bookeeper")), None);
        assert_eq!(
            check_path(Path::new(r"\\server\share\x")),
            Some(FolderProblem::Network)
        );
        assert_eq!(
            check_path(Path::new(r"relative\x")),
            Some(FolderProblem::NotAbsolute)
        );
        assert_eq!(
            check_path(Path::new(&format!(r"C:\{}", "a".repeat(200)))),
            Some(FolderProblem::TooLong)
        );
    }
}
