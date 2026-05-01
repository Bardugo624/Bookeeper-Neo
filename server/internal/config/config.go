// Package config loads server configuration from environment variables with
// sensible defaults for a LAN deployment on a home NAS or PC.
package config

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// Config holds runtime configuration for the server. All fields are
// populated by Load().
type Config struct {
	// HTTP listen addresses (terminated by Caddy in front).
	BindAuth string // authenticated (mTLS-required) surface — Caddy 8443 → here
	BindBoot string // bootstrap surface — Caddy 8080 → here

	DataDir string // root for sqlite + covers + ca material

	JWTSecret       []byte
	JWTAccessTTL    time.Duration
	JWTRefreshTTL   time.Duration
	PairingTokenTTL time.Duration

	ServiceName string // mDNS instance name
	ServerHost  string // host advertised to clients (tailnet hostname or LAN name)
	ServerPort  int    // public mTLS port (Caddy front)
	EnableMDNS  bool   // off by default — only useful on flat LAN deployments

	// Trust pool: Caddy mTLS trust file location (must be on a volume shared
	// with the Caddy container) and Caddy admin API URL for hot-reload.
	TrustPoolPath string
	CaddyAdminURL string
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(k string, def bool) bool {
	if v := os.Getenv(k); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

func envDur(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

// Load reads the configuration from the environment. If JWT_SECRET is unset,
// a 32-byte secret is generated once and persisted under <DATA_DIR>/jwt.key
// so restarts don't invalidate existing sessions.
func Load() (*Config, error) {
	cfg := &Config{
		BindAuth:        envOr("BIND_AUTH", ":7842"),
		BindBoot:        envOr("BIND_BOOT", ":7843"),
		DataDir:         envOr("DATA_DIR", "/data"),
		JWTAccessTTL:    envDur("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:   envDur("JWT_REFRESH_TTL", 30*24*time.Hour),
		PairingTokenTTL: envDur("PAIRING_TTL", 2*time.Minute),
		ServiceName:     envOr("SERVICE_NAME", "Bookeeper"),
		ServerHost:      envOr("SERVER_HOST", "bookeeper.local"),
		ServerPort:      envInt("SERVER_PORT", 8443),
		EnableMDNS:      envBool("ENABLE_MDNS", false),
		TrustPoolPath:   envOr("TRUST_POOL_PATH", "/certs/trusted_clients.pem"),
		CaddyAdminURL:   envOr("CADDY_ADMIN_URL", "http://bookeeper-caddy:2019"),
	}
	if err := os.MkdirAll(cfg.DataDir, 0o750); err != nil {
		return nil, err
	}
	if s := os.Getenv("JWT_SECRET"); s != "" {
		cfg.JWTSecret = []byte(s)
	} else {
		secret, err := loadOrGenSecret(filepath.Join(cfg.DataDir, "jwt.key"))
		if err != nil {
			return nil, err
		}
		cfg.JWTSecret = secret
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, errors.New("config: JWT_SECRET must be at least 32 bytes")
	}
	return cfg, nil
}

func loadOrGenSecret(path string) ([]byte, error) {
	if b, err := os.ReadFile(path); err == nil && len(b) >= 32 {
		return b, nil
	}
	buf := make([]byte, 48)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	enc := []byte(base64.RawStdEncoding.EncodeToString(buf))
	if err := os.WriteFile(path, enc, 0o600); err != nil {
		return nil, err
	}
	return enc, nil
}
