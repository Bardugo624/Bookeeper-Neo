// Package csr genera CSR ECDSA P-256 per il pairing del desktop.
//
// La chiave privata non lascia mai il client: viene generata in memoria,
// usata per firmare il CSR, e poi serializzata in PEM PKCS#8 per essere
// salvata accanto al certificato che il server emette.
package csr

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
)

// Generated è il risultato di Generate: CSR PEM (da spedire al server) e
// chiave privata PEM (da persistere localmente).
type Generated struct {
	CSRPem string
	KeyPem string
}

// Generate produce un CSR P-256 con un Common Name informativo. Il server
// ignora i campi del subject (riempie tenant/user/device dalle SAN custom
// in IssueClient), quindi il CN è solo per debug.
func Generate(commonName string) (*Generated, error) {
	if commonName == "" {
		return nil, errors.New("common name required")
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("ecdsa keygen: %w", err)
	}
	tpl := &x509.CertificateRequest{
		Subject:            pkix.Name{CommonName: commonName},
		SignatureAlgorithm: x509.ECDSAWithSHA256,
	}
	der, err := x509.CreateCertificateRequest(rand.Reader, tpl, priv)
	if err != nil {
		return nil, fmt.Errorf("create csr: %w", err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, fmt.Errorf("marshal key: %w", err)
	}
	csrPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})
	keyPem := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	return &Generated{CSRPem: string(csrPem), KeyPem: string(keyPem)}, nil
}
