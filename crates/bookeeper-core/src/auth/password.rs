//! Password hashing with Argon2id (PHC strings).

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use std::sync::OnceLock;

pub fn hash(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}

/// Returns false for a wrong password and for a malformed hash.
pub fn verify(password: &str, phc: &str) -> bool {
    match PasswordHash::new(phc) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

/// Runs a verification against a fixed dummy hash, to keep timing equal when no user matches.
pub fn verify_dummy(password: &str) {
    static DUMMY: OnceLock<String> = OnceLock::new();
    let phc = DUMMY.get_or_init(|| hash("dummy-password-for-timing").unwrap_or_default());
    let _ = verify(password, phc);
}
