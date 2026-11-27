use bookeeper_desktop_lib::startup::{launch_mode, newer_library_message, LaunchMode, UPDATE_MARKER};

fn args(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}

#[test]
fn autostart_without_marker_is_minimized() {
    assert_eq!(launch_mode(&args(&["app", "--autostart"]), false), LaunchMode::Minimized);
}

#[test]
fn autostart_with_marker_is_normal() {
    assert_eq!(launch_mode(&args(&["app", "--autostart"]), true), LaunchMode::Normal);
}

#[test]
fn without_autostart_is_normal() {
    assert_eq!(launch_mode(&args(&["app"]), false), LaunchMode::Normal);
    assert_eq!(launch_mode(&[], false), LaunchMode::Normal);
}

#[test]
fn marker_name_and_message_languages() {
    assert_eq!(UPDATE_MARKER, ".updating");
    let m = newer_library_message();
    assert!(m.contains("più recente"));
    assert!(m.contains("newer version of Bookeeper"));
}
