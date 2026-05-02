package api

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
)

// ensureServerSlot lazily populates the auto-unlock slot of a tenant whose
// row predates migration 20260501000005, or whose slot was wiped (e.g. the
// /data/ca-server.key file was rotated). Called from any flow that already
// has an unlocked CA in hand: bootstrap-desktop, /api/v1/ca/unlock.
//
// On error it only logs — the calling flow has already succeeded for the
// user and we don't want to roll back a successful pairing just because the
// optimization didn't take.
func ensureServerSlot(ctx context.Context, db *sql.DB, tenantID string, c *ca.CA, serverKey []byte) {
	var existing []byte
	if err := db.QueryRowContext(ctx,
		`SELECT ca_key_enc_server FROM tenants WHERE id = ?`, tenantID,
	).Scan(&existing); err != nil {
		slog.Warn("ensureServerSlot: read failed", "tenant", tenantID, "err", err)
		return
	}
	if len(existing) > 0 {
		return
	}
	enc, nonce, err := ca.WrapWithServerKey(c, serverKey)
	if err != nil {
		slog.Warn("ensureServerSlot: wrap failed", "tenant", tenantID, "err", err)
		return
	}
	if _, err := db.ExecContext(ctx,
		`UPDATE tenants SET ca_key_enc_server = ?, ca_key_nonce_server = ? WHERE id = ?`,
		enc, nonce, tenantID,
	); err != nil {
		slog.Warn("ensureServerSlot: update failed", "tenant", tenantID, "err", err)
		return
	}
	slog.Info("ca server-key slot populated", "tenant", tenantID)
}
