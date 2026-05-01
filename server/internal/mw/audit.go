package mw

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Audit writes an append-only event row. Best-effort: errors are returned but
// callers typically log-and-continue so business writes are not blocked.
type Audit struct{ DB *sql.DB }

// Event is a single audit record. Before/After may be nil.
type Event struct {
	Action     string
	EntityType string
	EntityID   string
	Before     interface{}
	After      interface{}
}

func (a *Audit) Write(ctx context.Context, e Event) error {
	id, _ := FromContext(ctx)
	beforeJSON, err := marshalOrNil(e.Before)
	if err != nil {
		return err
	}
	afterJSON, err := marshalOrNil(e.After)
	if err != nil {
		return err
	}
	_, err = a.DB.ExecContext(ctx, `
        INSERT INTO audit_log
            (tenant_id, user_id, device_id, action, entity_type, entity_id, before_json, after_json, ip, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
		id.TenantID, nullable(id.UserID), nullable(id.DeviceID),
		e.Action, e.EntityType, e.EntityID, beforeJSON, afterJSON,
		nullable(id.IP), time.Now().Unix(),
	)
	return err
}

// WriteAnon writes an audit event for an unauthenticated request (e.g.
// pairing redemption). tenantID may be empty for pre-tenant bootstrap.
func (a *Audit) WriteAnon(ctx context.Context, tenantID, ip string, e Event) error {
	beforeJSON, err := marshalOrNil(e.Before)
	if err != nil {
		return err
	}
	afterJSON, err := marshalOrNil(e.After)
	if err != nil {
		return err
	}
	_, err = a.DB.ExecContext(ctx, `
        INSERT INTO audit_log
            (tenant_id, user_id, device_id, action, entity_type, entity_id, before_json, after_json, ip, ts)
        VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
    `,
		nullable(tenantID), e.Action, e.EntityType, e.EntityID,
		beforeJSON, afterJSON, nullable(ip), time.Now().Unix(),
	)
	return err
}

func marshalOrNil(v interface{}) (sql.NullString, error) {
	if v == nil {
		return sql.NullString{}, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return sql.NullString{}, err
	}
	return sql.NullString{String: string(b), Valid: true}, nil
}

func nullable(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
