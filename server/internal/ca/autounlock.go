package ca

import (
	"database/sql"
	"errors"
	"log/slog"
)

// AutoUnlockAll scans the tenants table and populates store with every CA
// whose server-key slot is filled. Tenants with NULL slot blobs (created
// before migration 20260501000005, or servers where the ca-server.key file
// was lost) are skipped silently — they will be migrated lazily on the next
// successful admin-password unlock.
//
// Shared by the standalone server binary and the embedded (in-app) server.
// Returns the number of CAs successfully cached.
func AutoUnlockAll(database *sql.DB, store *Store, serverKey []byte) (int, error) {
	rows, err := database.Query(`
        SELECT id, ca_cert_pem, ca_key_enc_server, ca_key_nonce_server
          FROM tenants
    `)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var id, certPEM string
		var encS, nonceS []byte
		if err := rows.Scan(&id, &certPEM, &encS, &nonceS); err != nil {
			return n, err
		}
		caInst, err := UnlockWithServerKey([]byte(certPEM), encS, nonceS, serverKey)
		if err != nil {
			if !errors.Is(err, ErrNoServerSlot) {
				slog.Warn("ca auto-unlock skipped", "tenant", id, "err", err)
			}
			continue
		}
		store.Set(id, caInst)
		n++
	}
	return n, rows.Err()
}
