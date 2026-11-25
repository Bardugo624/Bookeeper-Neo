use bookeeper_desktop_lib::files::{
    decode_base64, sanitize_name, save_to, write_atomic, SaveLock, SaveOutcome, MAX_NAME_LEN,
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

fn clean(n: &str) -> bool {
    !n.contains("..") && !n.ends_with('.') && !n.ends_with(' ') && !n.is_empty()
}

#[test]
fn truncation_never_leaves_double_dot_or_trailing_dot() {
    // Cut falls right after a dot, which then meets the extension's dot.
    let dot_cut = format!("{}.{}.csv", "x".repeat(115), "y".repeat(50));
    let s = sanitize_name(&dot_cut);
    assert!(clean(&s) && s.ends_with(".csv"), "{s}");
    assert!(s.chars().count() <= MAX_NAME_LEN);
    // Cut falls after a space / the whole tail is a long "extension".
    let space_cut = format!("{} {}.csv", "x".repeat(115), "y".repeat(50));
    let s = sanitize_name(&space_cut);
    assert!(clean(&s) && s.ends_with(".csv"), "{s:?}");
    for pre in 100..125 {
        let n = format!("{}.{}.pdf", "a".repeat(pre), "b".repeat(80));
        let s = sanitize_name(&n);
        assert!(clean(&s) && s.ends_with(".pdf"), "{pre}: {s:?}");
        let n = format!("{}.{}", "a".repeat(pre), " ".repeat(5) + &"b".repeat(200));
        assert!(clean(&sanitize_name(&n)), "{pre}");
    }
    assert!(clean(&sanitize_name("a. .")));
}

#[test]
fn sanitizing_is_idempotent() {
    let names: Vec<String> = (0..20)
        .map(|i| match i % 4 {
            0 => format!("{}.{}.csv", "x".repeat(100 + i), "y".repeat(60)),
            1 => format!("{} .{}", "é".repeat(110 + i), "z".repeat(40)),
            2 => format!("..{}/a\\b. .", "q".repeat(i * 7)),
            _ => format!("{}{}.zip", "m".repeat(119 - i % 3), ". ".repeat(i)),
        })
        .collect();
    for n in names {
        let once = sanitize_name(&n);
        assert_eq!(sanitize_name(&once), once, "{n:?}");
    }
}

#[test]
fn cancelled_outcome_has_no_path_key() {
    let v = serde_json::to_value(SaveOutcome {
        saved: false,
        path: None,
    })
    .unwrap();
    assert_eq!(v, serde_json::json!({ "saved": false }));
    assert!(v.get("path").is_none());
    let v = serde_json::to_value(SaveOutcome {
        saved: true,
        path: Some("/x".into()),
    })
    .unwrap();
    assert_eq!(v["path"], "/x");
}

#[test]
fn save_lock_allows_one_at_a_time_and_releases_on_error() {
    let lock = SaveLock::new();
    let first = lock.try_acquire().expect("first");
    assert!(lock.try_acquire().is_none());
    drop(first);
    assert!(lock.try_acquire().is_some());
    // Released even when the guarded work fails.
    let run = |l: &SaveLock| -> Result<(), String> {
        let _p = l.try_acquire().ok_or("busy")?;
        Err("boom".into())
    };
    assert_eq!(run(&lock), Err("boom".to_string()));
    assert!(lock.try_acquire().is_some());
}

/// Small deterministic generator (xorshift), no extra dependency.
fn next(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

#[test]
fn sanitizing_is_idempotent_over_generated_inputs() {
    // The case that used to break: only underscores survive until truncation cuts the one other char.
    let tricky = format!("{}x", "_".repeat(MAX_NAME_LEN));
    let once = sanitize_name(&tricky);
    assert_eq!(sanitize_name(&once), once);
    assert_eq!(once, "file");

    let alphabet: Vec<char> = "_._ .\t/\\:aZ9é\u{7}-".chars().collect();
    let mut state = 0x9E37_79B9_7F4A_7C15u64;
    for i in 0..4000 {
        let len = match i % 4 {
            0 => (next(&mut state) % 12) as usize,
            1 => MAX_NAME_LEN - 2 + (next(&mut state) % 6) as usize,
            _ => (next(&mut state) % 300) as usize,
        };
        // Every other input is mostly underscores, dots and spaces.
        let heavy = i % 2 == 0;
        let input: String = (0..len)
            .map(|_| {
                let r = next(&mut state);
                if heavy && !r.is_multiple_of(10) {
                    ['_', '.', ' '][(r / 10 % 3) as usize]
                } else {
                    alphabet[(r / 7) as usize % alphabet.len()]
                }
            })
            .collect();
        let once = sanitize_name(&input);
        assert_eq!(sanitize_name(&once), once, "input {input:?}");
        assert!(once.chars().count() <= MAX_NAME_LEN && !once.is_empty());
    }
}
