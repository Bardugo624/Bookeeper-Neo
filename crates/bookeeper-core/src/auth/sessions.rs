//! Device sessions: creation, refresh-token rotation, reuse detection and revocation.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use super::tokens::{hash_refresh, issue_access, new_refresh};
use super::{DeviceKind, Identity, Role, Session, ACCESS_TTL_SECS, REFRESH_TTL_SECS};

pub struct NewDevice<'a> {
    pub library_id: &'a str,
    pub user_id: &'a str,
    pub role: Role,
    pub name: &'a str,
    pub kind: DeviceKind,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RefreshError {
    Invalid,
    Reused,
    Revoked,
}

fn session(secret: &[u8], who: &Identity, refresh_token: String, now: i64) -> Session {
    Session {
        device_id: who.device_id.clone(),
        access_token: issue_access(secret, who, now),
        refresh_token,
        expires_in: ACCESS_TTL_SECS,
    }
}

pub fn create_device(
    conn: &Connection,
    secret: &[u8],
    new: NewDevice<'_>,
    now: i64,
) -> rusqlite::Result<Session> {
    let device_id = uuid::Uuid::now_v7().to_string();
    let (raw, hashed) = new_refresh();
    conn.execute(
        "INSERT INTO devices (id, library_id, user_id, name, kind, refresh_hash, paired_at, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            device_id,
            new.library_id,
            new.user_id,
            new.name,
            new.kind.as_str(),
            hashed,
            now
        ],
    )?;
    let who = Identity {
        library_id: new.library_id.to_string(),
        user_id: new.user_id.to_string(),
        device_id,
        role: new.role,
    };
    Ok(session(secret, &who, raw, now))
}

struct Row {
    id: String,
    library_id: String,
    user_id: String,
    role: String,
    last_seen: i64,
    revoked_at: Option<i64>,
}

const SELECT: &str = "SELECT d.id, d.library_id, d.user_id, u.role,
        COALESCE(d.last_seen, d.paired_at), d.revoked_at
     FROM devices d JOIN users u ON u.id = d.user_id";

fn find(conn: &Connection, column: &str, hash: &str) -> rusqlite::Result<Option<Row>> {
    conn.query_row(&format!("{SELECT} WHERE d.{column} = ?1"), [hash], |r| {
        Ok(Row {
            id: r.get(0)?,
            library_id: r.get(1)?,
            user_id: r.get(2)?,
            role: r.get(3)?,
            last_seen: r.get(4)?,
            revoked_at: r.get(5)?,
        })
    })
    .optional()
}

pub fn refresh(
    conn: &mut Connection,
    secret: &[u8],
    raw_refresh: &str,
    now: i64,
) -> rusqlite::Result<Result<Session, RefreshError>> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let hash = hash_refresh(raw_refresh);

    if let Some(row) = find(&tx, "refresh_hash", &hash)? {
        if row.revoked_at.is_some() {
            return Ok(Err(RefreshError::Revoked));
        }
        if now - row.last_seen > REFRESH_TTL_SECS {
            return Ok(Err(RefreshError::Invalid));
        }
        let Ok(role) = row.role.parse::<Role>() else {
            return Ok(Err(RefreshError::Invalid));
        };
        let (raw, new_hash) = new_refresh();
        tx.execute(
            "UPDATE devices SET refresh_prev_hash = ?1, refresh_hash = ?2, last_seen = ?3
             WHERE id = ?4",
            params![hash, new_hash, now, row.id],
        )?;
        tx.commit()?;
        let who = Identity {
            library_id: row.library_id,
            user_id: row.user_id,
            device_id: row.id,
            role,
        };
        return Ok(Ok(session(secret, &who, raw, now)));
    }

    if let Some(row) = find(&tx, "refresh_prev_hash", &hash)? {
        if row.revoked_at.is_none() {
            tx.execute(
                "UPDATE devices SET revoked_at = ?1 WHERE id = ?2",
                params![now, row.id],
            )?;
        }
        tx.commit()?;
        return Ok(Err(RefreshError::Reused));
    }

    Ok(Err(RefreshError::Invalid))
}

pub fn revoke_device(
    conn: &mut Connection,
    library_id: &str,
    device_id: &str,
    now: i64,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE devices SET revoked_at = ?1
         WHERE id = ?2 AND library_id = ?3 AND revoked_at IS NULL",
        params![now, device_id, library_id],
    )?;
    Ok(n > 0)
}
