package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the JWT payload used by access and refresh tokens.
type Claims struct {
	TenantID string `json:"tid"`
	UserID   string `json:"uid"`
	DeviceID string `json:"did"`
	Kind     string `json:"knd"` // "access" | "refresh"
	jwt.RegisteredClaims
}

// Issuer signs and validates JWTs with a shared HMAC secret.
type Issuer struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewIssuer(secret []byte, access, refresh time.Duration) *Issuer {
	return &Issuer{secret: secret, accessTTL: access, refreshTTL: refresh}
}

// Issue produces a new (access, refresh) pair.
func (i *Issuer) Issue(tenantID, userID, deviceID string) (access, refresh string, err error) {
	now := time.Now()
	access, err = i.sign(tenantID, userID, deviceID, "access", now, i.accessTTL)
	if err != nil {
		return
	}
	refresh, err = i.sign(tenantID, userID, deviceID, "refresh", now, i.refreshTTL)
	return
}

func (i *Issuer) sign(tid, uid, did, kind string, now time.Time, ttl time.Duration) (string, error) {
	c := Claims{
		TenantID: tid,
		UserID:   uid,
		DeviceID: did,
		Kind:     kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uid,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			NotBefore: jwt.NewNumericDate(now.Add(-1 * time.Minute)),
			Issuer:    "bookeeper",
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return tok.SignedString(i.secret)
}

// Parse validates a token, ensuring it is of the requested kind.
func (i *Issuer) Parse(tokenStr, expectedKind string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("auth: unexpected signing method")
		}
		return i.secret, nil
	})
	if err != nil {
		return nil, err
	}
	c, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, errors.New("auth: invalid token")
	}
	if c.Kind != expectedKind {
		return nil, errors.New("auth: wrong token kind")
	}
	return c, nil
}
