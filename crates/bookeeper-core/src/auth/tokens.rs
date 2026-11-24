//! Access tokens (HS256 JWT), refresh tokens and one-time codes.

use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rand::{Rng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{Identity, Role, ACCESS_TTL_SECS};

const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccessClaims {
    pub lid: String,
    pub uid: String,
    pub did: String,
    pub role: Role,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TokenError {
    Expired,
    Invalid,
}

pub fn issue_access(secret: &[u8], who: &Identity, now: i64) -> String {
    let claims = AccessClaims {
        lid: who.library_id.clone(),
        uid: who.user_id.clone(),
        did: who.device_id.clone(),
        role: who.role,
        iat: now,
        exp: now + ACCESS_TTL_SECS,
    };
    // Serializing plain claims with an HMAC key cannot fail.
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .unwrap_or_default()
}

pub fn verify_access(secret: &[u8], token: &str, now: i64) -> Result<AccessClaims, TokenError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.required_spec_claims.clear();
    let data = decode::<AccessClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map_err(|_| TokenError::Invalid)?;
    if data.claims.exp <= now {
        return Err(TokenError::Expired);
    }
    Ok(data.claims)
}

fn base64url(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |acc, (i, b)| acc | (u32::from(*b) << (16 - 8 * i)));
        for i in 0..=chunk.len() {
            out.push(char::from(T[((n >> (18 - 6 * i)) & 63) as usize]));
        }
    }
    out
}

pub fn new_refresh() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let raw = base64url(&bytes);
    let hashed = hash_refresh(&raw);
    (raw, hashed)
}

pub fn hash_refresh(raw: &str) -> String {
    hex::encode(Sha256::digest(raw.as_bytes()))
}

fn random_code(len: usize) -> String {
    let mut rng = rand::rng();
    (0..len)
        .map(|_| char::from(CODE_ALPHABET[rng.random_range(0..CODE_ALPHABET.len())]))
        .collect()
}

pub fn new_pairing_code() -> String {
    random_code(8)
}

pub fn new_setup_code() -> String {
    let raw = random_code(12);
    format!("{}-{}-{}", &raw[0..4], &raw[4..8], &raw[8..12])
}

pub fn hash_code(code: &str) -> String {
    let normalized: String = code
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .flat_map(char::to_uppercase)
        .collect();
    hex::encode(Sha256::digest(normalized.as_bytes()))
}
