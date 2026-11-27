//! How the app starts: shown or minimized, and the message for a library that is too new.

/// Argument the login entry passes, so the app can tell a login start from a click.
pub const AUTOSTART_ARG: &str = "--autostart";
/// File in the data folder written before an update installs; the restart after it is not a login.
pub const UPDATE_MARKER: &str = ".updating";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchMode {
    Normal,
    Minimized,
}

/// `Minimized` only for a login start that does not follow an update restart.
pub fn launch_mode(args: &[String], update_marker: bool) -> LaunchMode {
    if !update_marker && args.iter().any(|a| a == AUTOSTART_ARG) {
        LaunchMode::Minimized
    } else {
        LaunchMode::Normal
    }
}

/// Shown before the interface exists, so it carries both languages.
pub fn newer_library_message() -> &'static str {
    "Questa libreria è di una versione più recente di Bookeeper. Installa la versione più recente per aprirla.\n\nThis library comes from a newer version of Bookeeper. Install the latest version to open it."
}
