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
	KeyEnc   []byte // AES-GCM ciphertext of PKCS8 private key
	KeySalt  []byte // Argon2id salt
	KeyNonce []byte // AES-GCM nonce
}

// Bootstrap generates a fresh ECDSA P-256 root CA for a tenant and encrypts
// its private key with the tenant admin password.
func Bootstrap(tenantName, adminPassword string) (*Material, error) {
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
	return &Material{CertPEM: certPEM, KeyEnc: enc, KeySalt: salt, KeyNonce: nonce}, nil
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
