use bookeeper_desktop_lib::files::{
    decode_base64, sanitize_name, save_to, write_atomic, MAX_NAME_LEN,
};

#[test]
fn separators_and_dots_are_removed() {
    assert_eq!(sanitize_name("a/b\\c.txt"), "a_b_c.txt");
    for n in ["../../etc/passwd", "..", "...", "a..b"] {
        let s = sanitize_name(n);
        assert!(!s.contains(".."), "{s}");
        assert!(!s.contains('/') && !s.contains('\\'), "{s}");
    }
}

#[test]
fn control_characters_are_removed() {
    let s = sanitize_name("a\u{0}b\nc\td.csv");
    assert!(!s.chars().any(char::is_control), "{s:?}");
    assert!(s.ends_with(".csv"));
}

#[test]
fn empty_names_become_file() {
    for n in ["", "   ", ".", "..", "///"] {
        assert_eq!(sanitize_name(n), "file", "{n:?}");
    }
}

#[test]
fn long_names_keep_their_extension() {
    let s = sanitize_name(&format!("{}.zip", "x".repeat(300)));
    assert_eq!(s.chars().count(), MAX_NAME_LEN);
    assert!(s.ends_with(".zip"));
    let multi = sanitize_name(&format!("{}.csv", "è".repeat(200)));
    assert_eq!(multi.chars().count(), MAX_NAME_LEN);
    assert!(multi.ends_with(".csv"));
    assert_eq!(sanitize_name("libri.csv"), "libri.csv");
}

#[test]
fn writes_atomically_and_leaves_no_temp_file() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("out.bin");
    let out = save_to(&p, "aGVsbG8=").unwrap();
    assert!(out.saved);
    assert_eq!(out.path.as_deref(), Some(p.to_str().unwrap()));
    assert_eq!(std::fs::read(&p).unwrap(), b"hello");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn invalid_base64_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("out.bin");
    assert!(decode_base64("not base64 !!").is_err());
    assert!(save_to(&p, "not base64 !!").is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn existing_file_is_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("out.bin");
    std::fs::write(&p, b"old old old old").unwrap();
    write_atomic(&p, b"new").unwrap();
    assert_eq!(std::fs::read(&p).unwrap(), b"new");
}

#[test]
fn missing_folder_is_an_error() {
    let dir = tempfile::tempdir().unwrap();
    assert!(write_atomic(&dir.path().join("nope/out.bin"), b"x").is_err());
}
