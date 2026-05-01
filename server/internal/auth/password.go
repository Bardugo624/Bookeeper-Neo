// Package auth provides Argon2id password hashing, JWT issuance/verification,
// and request-scoped helpers for users and devices.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters tuned for a small home server (~50ms on modern CPU).
const (
	pwTime    = 2
	pwMemory  = 64 * 1024
	pwThreads = 2
	pwKeyLen  = 32
	pwSaltLen = 16
)

// HashPassword returns an Argon2id encoded string compatible with the standard
// `$argon2id$v=19$m=...,t=...,p=...$salt$hash` format.
func HashPassword(pw string) (string, error) {
	salt := make([]byte, pwSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(pw), salt, pwTime, pwMemory, pwThreads, pwKeyLen)
	enc := func(b []byte) string { return base64.RawStdEncoding.EncodeToString(b) }
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, pwMemory, pwTime, pwThreads, enc(salt), enc(hash)), nil
}

// VerifyPassword checks a plaintext password against an encoded hash. Returns
// nil on match, an error otherwise.
func VerifyPassword(pw, encoded string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return errors.New("auth: malformed hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return errors.New("auth: bad argon2 version")
	}
	var m uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return errors.New("auth: bad argon2 params")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return err
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return err
	}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return errors.New("auth: bad password")
	}
	return nil
}
