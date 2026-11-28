use bookeeper_desktop_lib::startup::{
    launch_mode, newer_library_message, second_launch_shows_main, LaunchMode, Outcome,
    UPDATE_MARKER,
};

fn args(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}

#[test]
fn autostart_without_marker_is_minimized() {
    assert_eq!(
        launch_mode(&args(&["app", "--autostart"]), false),
        LaunchMode::Minimized
    );
}

#[test]
fn autostart_with_marker_is_normal() {
    assert_eq!(
        launch_mode(&args(&["app", "--autostart"]), true),
        LaunchMode::Normal
    );
}

#[test]
fn without_autostart_is_normal() {
    assert_eq!(launch_mode(&args(&["app"]), false), LaunchMode::Normal);
    assert_eq!(launch_mode(&[], false), LaunchMode::Normal);
}

#[test]
fn second_launch_shows_the_window_only_after_a_full_start() {
    assert!(second_launch_shows_main(Some(Outcome::Ready)));
    // Stopped at the newer-library message: the window has no library behind it.
    assert!(!second_launch_shows_main(Some(Outcome::NewerLibrary)));
    // Start-up still running: it shows the window itself.
    assert!(!second_launch_shows_main(None));
}

#[test]
fn marker_name_and_message_languages() {
    assert_eq!(UPDATE_MARKER, ".updating");
    let m = newer_library_message();
    assert!(m.contains("più recente"));
    assert!(m.contains("newer version of Bookeeper"));
}
