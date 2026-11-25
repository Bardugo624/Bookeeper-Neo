use crate::auth::guard::AuthUser;

/// Writes a row into `audit_log`. Call it inside the transaction of the change.
pub fn record(
    conn: &rusqlite::Connection,
    who: &AuthUser,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    detail: Option<&serde_json::Value>,
    now: i64,
) -> rusqlite::Result<()> {
    let detail_json = detail.map(serde_json::Value::to_string);
    conn.execute(
        "INSERT INTO audit_log \
         (library_id, user_id, device_id, action, entity_type, entity_id, detail_json, ip, at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
        rusqlite::params![
            who.library_id,
            who.user_id,
            who.device_id,
            action,
            entity_type,
            entity_id,
            detail_json,
            now
        ],
    )?;
    Ok(())
}
