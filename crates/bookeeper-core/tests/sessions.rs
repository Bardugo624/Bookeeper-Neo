mod common;

use bookeeper_core::auth::sessions::{
    create_device, refresh, revoke_device, NewDevice, RefreshError,
};
use bookeeper_core::auth::tokens::{hash_refresh, verify_access};
use bookeeper_core::auth::{DeviceKind, Role, REFRESH_TTL_SECS};
use bookeeper_core::Db;
use rusqlite::Connection;

const T0: i64 = 1_700_000_000;

fn conn_with_user(role: Role) -> (Db, String, String) {
    let db = Db::open_in_memory().unwrap();
    let (lib, user) = ("lib-1".to_string(), "user-1".to_string());
    let (l, u) = (lib.clone(), user.clone());
    db.with(move |c| {
        c.execute(
            "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Casa', 0)",
            [&l],
        )?;
        c.execute(
            "INSERT INTO users (id, library_id, display_name, role, created_at)
             VALUES (?1, ?2, 'Ada', ?3, 0)",
            rusqlite::params![u, l, role.as_str()],
        )
        .map(|_| ())
    })
    .unwrap();
    (db, lib, user)
}

const SECRET: &[u8] = b"0123456789abcdef0123456789abcdef";

fn new_device<'a>(lib: &'a str, user: &'a str, role: Role) -> NewDevice<'a> {
    NewDevice {
        library_id: lib,
        user_id: user,
        role,
        name: "Desktop",
        kind: DeviceKind::Desktop,
    }
}

fn row(c: &Connection, id: &str) -> (String, Option<String>, Option<i64>, Option<i64>) {
    c.query_row(
        "SELECT refresh_hash, refresh_prev_hash, last_seen, revoked_at FROM devices WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
    .unwrap()
}

#[test]
fn create_device_stores_only_the_hash() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        assert_eq!(s.expires_in, 900);
        let (hash, prev, last_seen, revoked) = row(c, &s.device_id);
        assert_eq!(hash, hash_refresh(&s.refresh_token));
        assert_ne!(hash, s.refresh_token);
        assert!(prev.is_none() && revoked.is_none());
        assert_eq!(last_seen, Some(T0));
        let leaked: i64 = c.query_row(
            "SELECT COUNT(*) FROM devices WHERE refresh_hash = ?1 OR refresh_prev_hash = ?1
               OR name = ?1",
            [&s.refresh_token],
            |r| r.get(0),
        )?;
        assert_eq!(leaked, 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn access_token_carries_the_identity() {
    let (db, lib, user) = conn_with_user(Role::Admin);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Admin), T0)?;
        let claims = verify_access(SECRET, &s.access_token, T0).unwrap();
        assert_eq!(claims.lid, lib);
        assert_eq!(claims.uid, user);
        assert_eq!(claims.did, s.device_id);
        assert_eq!(claims.role, Role::Admin);
        Ok(())
    })
    .unwrap();
}

#[test]
fn refresh_rotates() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        let next = refresh(c, SECRET, &s.refresh_token, T0 + 60)?.unwrap();
        assert_ne!(next.refresh_token, s.refresh_token);
        assert_eq!(next.device_id, s.device_id);
        let (hash, prev, last_seen, revoked) = row(c, &s.device_id);
        assert_eq!(hash, hash_refresh(&next.refresh_token));
        assert_ne!(hash, hash_refresh(&s.refresh_token));
        assert_eq!(prev, Some(hash_refresh(&s.refresh_token)));
        assert_eq!(last_seen, Some(T0 + 60));
        assert!(revoked.is_none());
        Ok(())
    })
    .unwrap();
}

#[test]
fn reusing_a_rotated_token_revokes_the_device() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        let next = refresh(c, SECRET, &s.refresh_token, T0 + 1)?.unwrap();
        assert_eq!(
            refresh(c, SECRET, &s.refresh_token, T0 + 2)?.unwrap_err(),
            RefreshError::Reused
        );
        assert_eq!(row(c, &s.device_id).3, Some(T0 + 2));
        assert_eq!(
            refresh(c, SECRET, &next.refresh_token, T0 + 3)?.unwrap_err(),
            RefreshError::Revoked
        );
        Ok(())
    })
    .unwrap();
}

#[test]
fn unknown_token_is_invalid() {
    let (db, _, _) = conn_with_user(Role::Owner);
    db.with(|c| {
        assert_eq!(
            refresh(c, SECRET, "nope", T0)?.unwrap_err(),
            RefreshError::Invalid
        );
        Ok(())
    })
    .unwrap();
}

#[test]
fn refresh_expires_after_thirty_days_idle() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        let late = T0 + REFRESH_TTL_SECS + 1;
        assert_eq!(
            refresh(c, SECRET, &s.refresh_token, late)?.unwrap_err(),
            RefreshError::Invalid
        );
        // Nothing changed, so the exact boundary still works.
        let (hash, prev, last_seen, _) = row(c, &s.device_id);
        assert_eq!(hash, hash_refresh(&s.refresh_token));
        assert!(prev.is_none());
        assert_eq!(last_seen, Some(T0));
        assert!(refresh(c, SECRET, &s.refresh_token, T0 + REFRESH_TTL_SECS)?.is_ok());
        Ok(())
    })
    .unwrap();
}

#[test]
fn refresh_picks_up_a_role_change() {
    let (db, lib, user) = conn_with_user(Role::Member);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Member), T0)?;
        c.execute("UPDATE users SET role = 'admin' WHERE id = ?1", [&user])?;
        let next = refresh(c, SECRET, &s.refresh_token, T0 + 1)?.unwrap();
        let claims = verify_access(SECRET, &next.access_token, T0 + 1).unwrap();
        assert_eq!(claims.role, Role::Admin);
        Ok(())
    })
    .unwrap();
}

#[test]
fn revoke_is_scoped_to_the_library() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        assert!(!revoke_device(c, "other-library", &s.device_id, T0 + 1)?);
        assert_eq!(row(c, &s.device_id).3, None);
        assert!(revoke_device(c, &lib, &s.device_id, T0 + 1)?);
        Ok(())
    })
    .unwrap();
}

#[test]
fn revoke_twice_reports_false_the_second_time() {
    let (db, lib, user) = conn_with_user(Role::Owner);
    db.with(|c| {
        let s = create_device(c, SECRET, new_device(&lib, &user, Role::Owner), T0)?;
        assert!(revoke_device(c, &lib, &s.device_id, T0 + 1)?);
        assert!(!revoke_device(c, &lib, &s.device_id, T0 + 2)?);
        assert_eq!(row(c, &s.device_id).3, Some(T0 + 1));
        Ok(())
    })
    .unwrap();
}

#[test]
fn concurrent_refresh_one_wins() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite");
    let first = Db::open(&path).unwrap();
    let (lib, user) = ("lib-1".to_string(), "user-1".to_string());
    let (l, u) = (lib.clone(), user.clone());
    let raw = first
        .with(move |c| {
            c.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Casa', 0)",
                [&l],
            )?;
            c.execute(
                "INSERT INTO users (id, library_id, display_name, role, created_at)
                 VALUES (?1, ?2, 'Ada', 'owner', 0)",
                [&u, &l],
            )?;
            Ok(create_device(c, SECRET, new_device(&l, &u, Role::Owner), T0)?.refresh_token)
        })
        .unwrap();

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = (0..2)
        .map(|_| {
            let (path, raw, barrier) = (path.clone(), raw.clone(), barrier.clone());
            std::thread::spawn(move || {
                let db = Db::open(&path).unwrap();
                barrier.wait();
                db.with(|c| refresh(c, SECRET, &raw, T0 + 1)).unwrap()
            })
        })
        .collect();
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let ok = results.iter().filter(|r| r.is_ok()).count();
    let reused = results
        .iter()
        .filter(|r| matches!(r, Err(RefreshError::Reused)))
        .count();
    assert_eq!((ok, reused), (1, 1));
}
