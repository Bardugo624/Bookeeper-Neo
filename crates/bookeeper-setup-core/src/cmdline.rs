//! Command lines: the ones we write for NSIS and the ones we read from Windows.
//!
//! NSIS ignores `/D=` and `_?=` when they are quoted, so the folder is written raw,
//! spaces and accents included. Callers must pass the result to `CommandExt::raw_arg`.

use std::path::{Path, PathBuf};

/// `/S /D=<dir>` or, for updates and repairs, `/S /UPDATE /D=<dir>`.
pub fn install_args(dir: &Path, update: bool) -> String {
    if update {
        format!("/S /UPDATE /D={}", dir.display())
    } else {
        format!("/S /D={}", dir.display())
    }
}

/// `/S _?=<dir>`.
pub fn uninstall_args(dir: &Path) -> String {
    format!("/S _?={}", dir.display())
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UninstallArgs {
    /// Windowless, library kept (`/P` or `/UPDATE`, from NSIS's reinstall page).
    pub passive: bool,
    pub quiet: bool,
    pub delete_data: bool,
    pub dir: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuietInstallArgs {
    pub dir: Option<PathBuf>,
    pub desktop_icon: bool,
    pub autostart: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invocation {
    Gui,
    SmokeUi,
    QuietInstall(QuietInstallArgs),
    Uninstall(UninstallArgs),
}

const DIR_MARK: &str = " _?=";

/// Parses the raw command line (program name included, as `GetCommandLineW` gives it).
pub fn parse_invocation(raw: &str) -> Result<Invocation, String> {
    // Only the part before ` _?=` is split Windows-style: what follows is the folder, spaces included.
    let (head, nsis_dir) = match raw.find(DIR_MARK) {
        Some(i) => {
            let dir = raw[i + DIR_MARK.len()..].trim_end();
            if dir.is_empty() {
                return Err("_?= needs a folder".into());
            }
            (&raw[..i], Some(PathBuf::from(dir)))
        }
        None => (raw, None),
    };
    let args = split_args(skip_program(head));

    let (mut quiet, mut uninstall, mut delete_data, mut passive) = (false, false, false, false);
    let (mut no_desktop, mut autostart, mut smoke) = (false, false, false);
    let mut dir_flag: Option<PathBuf> = None;
    for a in &args {
        if let Some(v) = a.strip_prefix("--dir=") {
            if v.is_empty() {
                return Err("--dir= needs a folder".into());
            }
            dir_flag = Some(PathBuf::from(v));
            continue;
        }
        match a.as_str() {
            "--quiet" => quiet = true,
            "--no-desktop" => no_desktop = true,
            "--autostart" => autostart = true,
            "--uninstall" => uninstall = true,
            "--delete-data" => delete_data = true,
            "--smoke-ui" => smoke = true,
            s if s.eq_ignore_ascii_case("/P") || s.eq_ignore_ascii_case("/UPDATE") => {
                passive = true
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }

    if smoke {
        let alone = !(quiet || uninstall || delete_data || passive || no_desktop || autostart)
            && dir_flag.is_none()
            && nsis_dir.is_none();
        return if alone {
            Ok(Invocation::SmokeUi)
        } else {
            Err("--smoke-ui takes no other argument".into())
        };
    }
    if uninstall {
        if no_desktop || autostart {
            return Err("--no-desktop and --autostart are for installing".into());
        }
        return Ok(Invocation::Uninstall(UninstallArgs {
            passive,
            quiet,
            delete_data,
            dir: nsis_dir.or(dir_flag),
        }));
    }
    if passive || delete_data || nsis_dir.is_some() {
        return Err("/P, /UPDATE, --delete-data and _?= need --uninstall".into());
    }
    if quiet {
        return Ok(Invocation::QuietInstall(QuietInstallArgs {
            dir: dir_flag,
            desktop_icon: !no_desktop,
            autostart,
        }));
    }
    if no_desktop || autostart || dir_flag.is_some() {
        return Err("--dir, --no-desktop and --autostart need --quiet".into());
    }
    Ok(Invocation::Gui)
}

/// Drops the program name, which has its own quoting rule (no backslash escapes).
fn skip_program(line: &str) -> &str {
    let line = line.trim_start();
    if let Some(rest) = line.strip_prefix('"') {
        return rest.find('"').map_or("", |i| &rest[i + 1..]);
    }
    line.find(char::is_whitespace).map_or("", |i| &line[i..])
}

/// `CommandLineToArgvW` rules for the arguments after the program name.
fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = s.chars().peekable();
    loop {
        while chars.peek().is_some_and(|c| c.is_whitespace()) {
            chars.next();
        }
        if chars.peek().is_none() {
            return out;
        }
        let (mut cur, mut in_quotes, mut slashes) = (String::new(), false, 0usize);
        while let Some(&c) = chars.peek() {
            match c {
                '\\' => slashes += 1,
                '"' => {
                    cur.extend(std::iter::repeat_n('\\', slashes / 2));
                    if slashes % 2 == 1 {
                        cur.push('"');
                    } else {
                        in_quotes = !in_quotes;
                    }
                    slashes = 0;
                }
                c if c.is_whitespace() && !in_quotes => break,
                c => {
                    cur.extend(std::iter::repeat_n('\\', slashes));
                    slashes = 0;
                    cur.push(c);
                }
            }
            chars.next();
        }
        cur.extend(std::iter::repeat_n('\\', slashes));
        out.push(cur);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIR: &str = r"C:\Prova Bookeeper\Libreria è";

    #[test]
    fn install_args_keep_spaces_and_accents_unquoted() {
        let d = Path::new(DIR);
        assert_eq!(
            install_args(d, false),
            r"/S /D=C:\Prova Bookeeper\Libreria è"
        );
        assert_eq!(
            install_args(d, true),
            r"/S /UPDATE /D=C:\Prova Bookeeper\Libreria è"
        );
        assert_eq!(uninstall_args(d), r"/S _?=C:\Prova Bookeeper\Libreria è");
    }

    #[test]
    fn parse_uninstall_from_nsis_reinstall_page() {
        let raw = r#""C:\x\bookeeper-setup.exe" --uninstall /P _?=C:\Users\Mario Rossi\AppData\Local\Bookeeper"#;
        assert_eq!(
            parse_invocation(raw),
            Ok(Invocation::Uninstall(UninstallArgs {
                passive: true,
                quiet: false,
                delete_data: false,
                dir: Some(PathBuf::from(
                    r"C:\Users\Mario Rossi\AppData\Local\Bookeeper"
                )),
            }))
        );
        let raw = r#""C:\x\bookeeper-setup.exe" --uninstall /UPDATE _?=C:\a b"#;
        assert!(matches!(parse_invocation(raw), Ok(Invocation::Uninstall(u)) if u.passive));
    }

    #[test]
    fn parse_quiet_install() {
        let raw = r#""C:\Users\Mario Rossi\Downloads\Bookeeper-Setup-2.2.0.exe" --quiet "--dir=C:\Prova è\Bookeeper" --no-desktop --autostart"#;
        assert_eq!(
            parse_invocation(raw),
            Ok(Invocation::QuietInstall(QuietInstallArgs {
                dir: Some(PathBuf::from(r"C:\Prova è\Bookeeper")),
                desktop_icon: false,
                autostart: true,
            }))
        );
        assert_eq!(
            parse_invocation("setup.exe --quiet"),
            Ok(Invocation::QuietInstall(QuietInstallArgs {
                dir: None,
                desktop_icon: true,
                autostart: false
            }))
        );
        assert_eq!(
            parse_invocation("bookeeper-setup.exe --uninstall --quiet --delete-data"),
            Ok(Invocation::Uninstall(UninstallArgs {
                passive: false,
                quiet: true,
                delete_data: true,
                dir: None
            }))
        );
    }

    #[test]
    fn parse_rejects_unknown_flag() {
        assert!(parse_invocation("setup.exe --bogus").is_err());
        assert!(parse_invocation("setup.exe --quiet --dir=").is_err());
        assert!(parse_invocation("setup.exe --delete-data").is_err());
        assert!(parse_invocation(r"setup.exe _?=C:\x").is_err());
        assert!(parse_invocation("setup.exe --dir=C:\\x").is_err());
    }

    #[test]
    fn parse_gui_without_flags() {
        assert_eq!(
            parse_invocation(r#""C:\Program Files\x\setup.exe""#),
            Ok(Invocation::Gui)
        );
        assert_eq!(parse_invocation("setup.exe"), Ok(Invocation::Gui));
        assert_eq!(
            parse_invocation("setup.exe --smoke-ui"),
            Ok(Invocation::SmokeUi)
        );
    }
}
