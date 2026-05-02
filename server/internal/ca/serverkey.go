package ca

import (
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// LoadOrCreateServerKey returns the 32-byte machine-local server key used
// for the auto-unlock slot of tenant CA private keys.
//
// On first boot the file at path does not exist: a fresh random key is
// generated and written with mode 0600. On subsequent boots the existing
// file is read and validated (must be exactly ServerKeyLen bytes).
//
// The directory containing path must already exist (typically /data, the
// same volume that holds the SQLite database).
func LoadOrCreateServerKey(path string) ([]byte, error) {
	if path == "" {
		return nil, errors.New("ca: server key path required")
	}
	b, err := os.ReadFile(path)
	if err == nil {
		if len(b) != ServerKeyLen {
			return nil, fmt.Errorf("ca: server key at %s has wrong length %d (want %d)", path, len(b), ServerKeyLen)
		}
		return b, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("ca: read server key: %w", err)
	}
	// First boot: generate.
	key := make([]byte, ServerKeyLen)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("ca: gen server key: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("ca: mkdir for server key: %w", err)
	}
	// O_EXCL guards against a race where two server processes start at once
	// and both try to bootstrap the key.
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		// If another process created it in the meantime, just re-read.
		if errors.Is(err, os.ErrExist) {
			return LoadOrCreateServerKey(path)
		}
		return nil, fmt.Errorf("ca: create server key: %w", err)
	}
	defer f.Close()
	if _, err := f.Write(key); err != nil {
		return nil, fmt.Errorf("ca: write server key: %w", err)
	}
	return key, nil
}
