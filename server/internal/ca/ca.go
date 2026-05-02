// Package ca implements a per-tenant internal Certificate Authority.
//
// At tenant bootstrap a CA root keypair is generated, the private key is
// encrypted at rest with AES-256-GCM using a key derived from the tenant
// admin password (Argon2id), and the resulting blob is stored in the
// tenants table. The CA never leaves the server process unencrypted.
//
// Client certs are issued on pairing: the client generates a keypair locally,
// submits a CSR, and the server returns a signed leaf cert valid 1 year.
// Revocation is row-based (devices.revoked_at) and surfaced via /crl.pem.
package ca

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"time"

	"golang.org/x/crypto/argon2"
)

const (
	caCommonName    = "Bookeeper Internal CA"
	leafValidity    = 365 * 24 * time.Hour
	caValidity      = 10 * 365 * 24 * time.Hour
	argonTime       = 3
	argonMemoryKiB  = 64 * 1024
	argonThreads    = 4
	argonKeyLen     = 32
	saltLen         = 16
	gcmNonceLen     = 12
)

// Material is everything needed to persist a freshly bootstrapped CA.
type Material struct {
	CertPEM  []byte // root cert, PEM encoded
	KeyEnc   []byte // AES-GCM ciphertext of PKCS8 private key (admin-pwd slot)
	KeySalt  []byte // Argon2id salt (admin-pwd slot)
	KeyNonce []byte // AES-GCM nonce (admin-pwd slot)

	// Server-key slot (post 2026-05). Same plaintext, encrypted with the
	// machine-local 32-byte server key. Lets the server auto-unlock all
	// tenant CAs on startup so non-admin users can pair mobile devices
	// without ever knowing the admin password.
	KeyEncServer   []byte
	KeyNonceServer []byte
}

// ServerKeyLen is the required length of the auto-unlock key.
const ServerKeyLen = 32

// Bootstrap generates a fresh ECDSA P-256 root CA for a tenant and encrypts
// its private key with the tenant admin password.
//
// If serverKey is non-nil (must be ServerKeyLen bytes) the same plaintext key
// is also wrapped with the server key (machine-local secret), populating the
// server-key slot fields. This lets the server auto-unlock the CA at boot
// without the admin password.
func Bootstrap(tenantName, adminPassword string, serverKey []byte) (*Material, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("ca: gen key: %w", err)
	}

	serial, err := randomSerial()
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   caCommonName,
			Organization: []string{"Bookeeper / " + tenantName},
		},
		NotBefore:             time.Now().Add(-1 * time.Minute),
		NotAfter:              time.Now().Add(caValidity),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLenZero:        true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		return nil, fmt.Errorf("ca: self-sign: %w", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	keyDER, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, err
	}
	enc, salt, nonce, err := encryptKey(keyDER, adminPassword)
	if err != nil {
		return nil, err
	}
	m := &Material{CertPEM: certPEM, KeyEnc: enc, KeySalt: salt, KeyNonce: nonce}
	if len(serverKey) == ServerKeyLen {
		encS, nonceS, err := encryptKeyRaw(keyDER, serverKey)
		if err != nil {
			return nil, err
		}
		m.KeyEncServer = encS
		m.KeyNonceServer = nonceS
	}
	return m, nil
}

// CA is an in-memory unlocked CA usable for issuing leaf certs.
type CA struct {
	Cert *x509.Certificate
	Key  *ecdsa.PrivateKey
}

// Unlock decrypts the stored CA private key using the admin password.
// It returns ErrBadPassword if decryption fails.
var ErrBadPassword = errors.New("ca: bad admin password")

func Unlock(certPEM, keyEnc, salt, nonce []byte, adminPassword string) (*CA, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, errors.New("ca: invalid cert PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}
	keyDER, err := decryptKey(keyEnc, salt, nonce, adminPassword)
	if err != nil {
		return nil, err
	}
	k, err := x509.ParsePKCS8PrivateKey(keyDER)
	if err != nil {
		return nil, err
	}
	priv, ok := k.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("ca: stored key is not ecdsa")
	}
	return &CA{Cert: cert, Key: priv}, nil
}

// IssuedCert is the result of signing a CSR.
type IssuedCert struct {
	CertPEM     []byte
	Serial      string // lowercase hex
	Fingerprint string // sha256 hex of DER
}

// IssueClient signs a CSR for a paired device. The CSR's public key is used
// as-is; subject is overridden with deviceID and userID for traceability.
func (c *CA) IssueClient(csr *x509.CertificateRequest, tenantID, userID, deviceID string) (*IssuedCert, error) {
	if err := csr.CheckSignature(); err != nil {
		return nil, fmt.Errorf("ca: bad csr signature: %w", err)
	}
	serial, err := randomSerial()
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:         deviceID,
			Organization:       []string{"Bookeeper"},
			OrganizationalUnit: []string{"tenant=" + tenantID, "user=" + userID},
		},
		NotBefore:   time.Now().Add(-1 * time.Minute),
		NotAfter:    time.Now().Add(leafValidity),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, c.Cert, csr.PublicKey, c.Key)
	if err != nil {
		return nil, fmt.Errorf("ca: sign csr: %w", err)
	}
	sum := sha256.Sum256(der)
	return &IssuedCert{
		CertPEM:     pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		Serial:      hex.EncodeToString(serial.Bytes()),
		Fingerprint: hex.EncodeToString(sum[:]),
	}, nil
}

// SignCRL produces a fresh CRL covering the supplied revoked serials.
// The serials are lowercase hex strings as stored in devices.cert_serial.
func (c *CA) SignCRL(revoked []RevokedCert) ([]byte, error) {
	entries := make([]x509.RevocationListEntry, 0, len(revoked))
	for _, r := range revoked {
		b, ok := new(big.Int).SetString(r.Serial, 16)
		if !ok {
			continue
		}
		entries = append(entries, x509.RevocationListEntry{
			SerialNumber:   b,
			RevocationTime: r.RevokedAt,
		})
	}
	tmpl := &x509.RevocationList{
		Number:                    big.NewInt(time.Now().Unix()),
		ThisUpdate:                time.Now(),
		NextUpdate:                time.Now().Add(24 * time.Hour),
		RevokedCertificateEntries: entries,
	}
	der, err := x509.CreateRevocationList(rand.Reader, tmpl, c.Cert, c.Key)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "X509 CRL", Bytes: der}), nil
}

// RevokedCert is a single CRL entry input.
type RevokedCert struct {
	Serial    string
	RevokedAt time.Time
}

// ErrNoServerSlot is returned by UnlockWithServerKey when the tenant row has
// not been migrated yet (server-key slot blobs are NULL/empty). Callers can
// fall back to the admin-password unlock path.
var ErrNoServerSlot = errors.New("ca: tenant has no server-key slot")

// UnlockWithServerKey decrypts the tenant CA private key using the
// machine-local server key (auto-unlock slot).
//
// Returns ErrNoServerSlot if the slot is empty (older tenants need to be
// migrated by calling WrapWithServerKey after a successful admin-password
// Unlock). Returns ErrBadPassword on auth-tag mismatch (key rotated /
// blob corrupted).
func UnlockWithServerKey(certPEM, keyEncServer, nonceServer, serverKey []byte) (*CA, error) {
	if len(keyEncServer) == 0 || len(nonceServer) == 0 {
		return nil, ErrNoServerSlot
	}
	if len(serverKey) != ServerKeyLen {
		return nil, fmt.Errorf("ca: server key must be %d bytes", ServerKeyLen)
	}
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, errors.New("ca: invalid cert PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}
	keyDER, err := decryptKeyRaw(keyEncServer, nonceServer, serverKey)
	if err != nil {
		return nil, err
	}
	k, err := x509.ParsePKCS8PrivateKey(keyDER)
	if err != nil {
		return nil, err
	}
	priv, ok := k.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("ca: stored key is not ecdsa")
	}
	return &CA{Cert: cert, Key: priv}, nil
}

// WrapWithServerKey re-encrypts an unlocked CA private key with the server
// key, producing the ciphertext + nonce to persist into the server-key slot.
// Used to migrate pre-existing tenants on first successful admin-pwd Unlock,
// and at bootstrap time for new tenants.
func WrapWithServerKey(c *CA, serverKey []byte) (encServer, nonceServer []byte, err error) {
	if len(serverKey) != ServerKeyLen {
		return nil, nil, fmt.Errorf("ca: server key must be %d bytes", ServerKeyLen)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(c.Key)
	if err != nil {
		return nil, nil, err
	}
	return encryptKeyRaw(keyDER, serverKey)
}

// ParseCSR parses a PEM-encoded PKCS#10 CSR submitted by a client.
func ParseCSR(pemBytes []byte) (*x509.CertificateRequest, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("ca: invalid csr pem")
	}
	return x509.ParseCertificateRequest(block.Bytes)
}

// ----- internal helpers -----

func randomSerial() (*big.Int, error) {
	max := new(big.Int).Lsh(big.NewInt(1), 159) // 159-bit positive
	return rand.Int(rand.Reader, max)
}

func deriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
}

// BurnArgon2id consuma il tempo di una derivazione Argon2id senza alcun
// effetto utile. Pensato per le superfici di autenticazione "lookup +
// password" (es. /setup/recover-invite) dove il caso "lookup vuoto" deve
// impiegare lo stesso tempo del caso "lookup pieno + password sbagliata"
// per non leakare l'esistenza dell'entita' tramite timing.
//
// Il salt e' derivato dalla password stessa via SHA-256 truncato:
// non serve casualita' (l'output viene buttato via), serve solo evitare
// l'errore "argon2: salt too short". Costo: ~100ms con i parametri
// correnti, identico a un decryptKey reale.
func BurnArgon2id(password string) {
	h := sha256.Sum256([]byte(password))
	_ = argon2.IDKey([]byte(password), h[:saltLen], argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
}

func encryptKey(plaintext []byte, password string) (ciphertext, salt, nonce []byte, err error) {
	salt = make([]byte, saltLen)
	if _, err = rand.Read(salt); err != nil {
		return
	}
	nonce = make([]byte, gcmNonceLen)
	if _, err = rand.Read(nonce); err != nil {
		return
	}
	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return
	}
	ciphertext = gcm.Seal(nil, nonce, plaintext, nil)
	return
}

func decryptKey(ciphertext, salt, nonce []byte, password string) ([]byte, error) {
	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	pt, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrBadPassword
	}
	return pt, nil
}

// encryptKeyRaw / decryptKeyRaw use a high-entropy 32-byte key directly
// (no Argon2id derivation). Used by the server-key auto-unlock slot.
func encryptKeyRaw(plaintext, key []byte) (ciphertext, nonce []byte, err error) {
	nonce = make([]byte, gcmNonceLen)
	if _, err = rand.Read(nonce); err != nil {
		return
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return
	}
	ciphertext = gcm.Seal(nil, nonce, plaintext, nil)
	return
}

func decryptKeyRaw(ciphertext, nonce, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	pt, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrBadPassword
	}
	return pt, nil
}

// FingerprintPEM returns the SHA-256 hex of the DER bytes of the first
// CERTIFICATE block in pemBytes. Empty string on invalid PEM.
func FingerprintPEM(pemBytes []byte) string {
	block, _ := pem.Decode(pemBytes)
	if block == nil || block.Type != "CERTIFICATE" {
		return ""
	}
	sum := sha256.Sum256(block.Bytes)
	return hex.EncodeToString(sum[:])
}
