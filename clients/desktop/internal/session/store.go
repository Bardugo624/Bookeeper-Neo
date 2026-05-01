// Package session gestisce la persistenza e l'uso del materiale crittografico
// del client Bookeeper (cert client mTLS, chiave privata, CA del server,
// JWT tokens). I file vivono in %APPDATA%/Bookeeper/<profile>/ su Windows e
// in ~/.config/Bookeeper/ su altre piattaforme.
//
// Il design è "single profile" per ora: un solo server alla volta. Aggiungere
// `Profile` come parametro permetterà multi-server in futuro senza rompere
// l'API.
package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Identity è lo stato persistito: tutto serve a re-instanziare l'http
// client mTLS senza richiedere all'utente di re-fare il pairing.
type Identity struct {
	ServerURL    string `json:"server_url"`
	DeviceID     string `json:"device_id"`
	UserID       string `json:"user_id,omitempty"`
	TenantID     string `json:"tenant_id,omitempty"`
	Email        string `json:"email,omitempty"`
	CertPEM      string `json:"cert_pem"`
	KeyPEM       string `json:"key_pem"`
	CACertPEM    string `json:"ca_cert_pem"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

const (
	identityFile = "identity.json"
	dirPerm      = 0o700
	filePerm     = 0o600
)

// ErrNoIdentity è restituito da Load quando non esiste ancora una sessione.
var ErrNoIdentity = errors.New("no identity stored: pairing required")

// dataDir restituisce la directory di lavoro del profilo corrente, creandola
// se manca con permessi restrittivi.
func dataDir() (string, error) {
	var base string
	switch runtime.GOOS {
	case "windows":
		base = os.Getenv("APPDATA")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, "AppData", "Roaming")
		}
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, "Library", "Application Support")
	default:
		base = os.Getenv("XDG_CONFIG_HOME")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, ".config")
		}
	}
	dir := filepath.Join(base, "Bookeeper")
	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return "", fmt.Errorf("data dir: %w", err)
	}
	return dir, nil
}

// Load deserializza l'identità dal disco. Restituisce ErrNoIdentity se il
// file non esiste (stato "primo avvio").
func Load() (*Identity, error) {
	dir, err := dataDir()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(dir, identityFile))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNoIdentity
		}
		return nil, err
	}
	var id Identity
	if err := json.Unmarshal(b, &id); err != nil {
		return nil, fmt.Errorf("identity unmarshal: %w", err)
	}
	if id.CertPEM == "" || id.KeyPEM == "" || id.CACertPEM == "" {
		return nil, ErrNoIdentity
	}
	return &id, nil
}

// Save scrive l'identità su disco con permessi 0600 (atomic via rename).
func Save(id *Identity) error {
	if id == nil {
		return errors.New("nil identity")
	}
	dir, err := dataDir()
	if err != nil {
		return err
	}
	tmp := filepath.Join(dir, identityFile+".tmp")
	dst := filepath.Join(dir, identityFile)
	b, err := json.MarshalIndent(id, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, filePerm); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}

// Wipe rimuove tutti i file di sessione. Usato dal logout duro.
func Wipe() error {
	dir, err := dataDir()
	if err != nil {
		return err
	}
	for _, name := range []string{identityFile, identityFile + ".tmp"} {
		_ = os.Remove(filepath.Join(dir, name))
	}
	return nil
}
