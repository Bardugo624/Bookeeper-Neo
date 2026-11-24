use bookeeper_core::auth::password::{hash, verify};
use bookeeper_core::auth::tokens::*;
use bookeeper_core::auth::{Identity, Role};
use std::collections::HashSet;

const SECRET: &[u8] = b"test-secret-test-secret-test-secret";
const ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

fn who() -> Identity {
    Identity {
        library_id: "lib".into(),
        user_id: "usr".into(),
        device_id: "dev".into(),
        role: Role::Admin,
    }
}

#[test]
fn password_round_trip() {
    let h = hash("corretta").unwrap();
    assert!(h.starts_with("$argon2id$"));
    assert!(verify("corretta", &h));
    assert!(!verify("sbagliata", &h));
    assert_ne!(h, hash("corretta").unwrap());
}

#[test]
fn verify_rejects_garbage_hash() {
    assert!(!verify("x", "not-a-hash"));
}

#[test]
fn access_token_round_trip() {
    let t = issue_access(SECRET, &who(), 1000);
    let c = verify_access(SECRET, &t, 1000 + 899).unwrap();
    assert_eq!(
        (c.lid.as_str(), c.uid.as_str(), c.did.as_str()),
        ("lib", "usr", "dev")
    );
    assert_eq!(c.role, Role::Admin);
    assert_eq!(c.exp, 1900);
}

#[test]
fn access_token_expires() {
    let t = issue_access(SECRET, &who(), 1000);
    assert_eq!(verify_access(SECRET, &t, 1900), Err(TokenError::Expired));
}

#[test]
fn access_token_rejects_other_secret() {
    let t = issue_access(SECRET, &who(), 1000);
    assert_eq!(
        verify_access(b"another-secret-another-secret-xx", &t, 1000),
        Err(TokenError::Invalid)
    );
}

#[test]
fn access_token_rejects_tampering() {
    let t = issue_access(SECRET, &who(), 1000);
    let mut parts: Vec<String> = t.split('.').map(String::from).collect();
    let mut chars: Vec<char> = parts[1].chars().collect();
    chars[5] = if chars[5] == 'A' { 'B' } else { 'A' };
    parts[1] = chars.into_iter().collect();
    assert_eq!(
        verify_access(SECRET, &parts.join("."), 1000),
        Err(TokenError::Invalid)
    );
}

#[test]
fn access_token_rejects_alg_none() {
    // {"alg":"none","typ":"JWT"}
    let header = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0";
    // {"lid":"lib","uid":"usr","did":"dev","role":"owner","iat":1000,"exp":1900}
    let payload = "eyJsaWQiOiJsaWIiLCJ1aWQiOiJ1c3IiLCJkaWQiOiJkZXYiLCJyb2xlIjoib3duZXIiLCJpYXQiOjEwMDAsImV4cCI6MTkwMH0";
    let token = format!("{header}.{payload}.");
    assert_eq!(
        verify_access(SECRET, &token, 1000),
        Err(TokenError::Invalid)
    );
}

#[test]
fn refresh_tokens_are_unique_and_hashed() {
    let mut seen = HashSet::new();
    for _ in 0..100 {
        let (raw, h) = new_refresh();
        assert_eq!(raw.len(), 43);
        assert!(raw
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_eq!(hash_refresh(&raw), h);
        assert_eq!(h.len(), 64);
        assert!(seen.insert(raw));
    }
}

#[test]
fn pairing_code_shape() {
    for _ in 0..200 {
        let c = new_pairing_code();
        assert_eq!(c.len(), 8);
        assert!(c.chars().all(|ch| ALPHABET.contains(ch)));
        assert!(!c.chars().any(|ch| "0O1IL".contains(ch)));
    }
}

#[test]
fn setup_code_shape() {
    for _ in 0..50 {
        let c = new_setup_code();
        let parts: Vec<&str> = c.split('-').collect();
        assert_eq!(parts.len(), 3);
        for p in parts {
            assert_eq!(p.len(), 4);
            assert!(p.chars().all(|ch| ALPHABET.contains(ch)));
        }
    }
}

#[test]
fn hash_code_ignores_case_spaces_and_dashes() {
    assert_eq!(hash_code("abcd-2345"), hash_code("ABCD 2345"));
    assert_eq!(hash_code("ABCD 2345"), hash_code("ABCD2345"));
}
