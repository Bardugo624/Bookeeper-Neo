-- +goose Up
-- +goose StatementBegin

-- Tenants: each tenant is a "household/family"
CREATE TABLE tenants (
    id              TEXT PRIMARY KEY,                  -- uuid
    name            TEXT NOT NULL,
    invite_code     TEXT NOT NULL UNIQUE,
    ca_cert_pem     TEXT NOT NULL,                     -- internal CA root cert (PEM)
    ca_key_enc      BLOB NOT NULL,                     -- AES-GCM(KDF(admin_pwd)) ciphertext of CA private key
    ca_key_salt     BLOB NOT NULL,                     -- 16 bytes salt for Argon2id KDF
    ca_key_nonce    BLOB NOT NULL,                     -- 12 bytes AES-GCM nonce
    created_at      INTEGER NOT NULL                   -- unix seconds
);

-- Users (scoped to tenant). Email unique per tenant.
CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,                     -- argon2id encoded
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',    -- owner|admin|member|viewer
    created_at      INTEGER NOT NULL,
    UNIQUE(tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- Devices: each paired client (desktop or mobile) gets an x509 cert
CREATE TABLE devices (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- "Lorenzo's iPhone"
    kind                TEXT NOT NULL,                 -- desktop|mobile
    cert_serial         TEXT NOT NULL UNIQUE,          -- hex serial of issued client cert
    cert_fingerprint    TEXT NOT NULL,                 -- sha256 hex of DER
    paired_at           INTEGER NOT NULL,
    last_seen           INTEGER,
    revoked_at          INTEGER
);
CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_user ON devices(user_id);

-- Pairing tokens: one-shot, short TTL, bound to a user. Used by mobile to redeem a cert.
CREATE TABLE pairing_tokens (
    token           TEXT PRIMARY KEY,                  -- random 256-bit base64url
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_kind     TEXT NOT NULL DEFAULT 'mobile',
    expires_at      INTEGER NOT NULL,
    used_at         INTEGER,
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_pairing_expires ON pairing_tokens(expires_at);

-- Libraries (rooms / locations)
CREATE TABLE libraries (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    location    TEXT,
    color       TEXT,
    icon        TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_libraries_tenant ON libraries(tenant_id);

-- Books
CREATE TABLE books (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    library_id      TEXT REFERENCES libraries(id) ON DELETE SET NULL,
    isbn_13         TEXT,
    isbn_10         TEXT,
    title           TEXT NOT NULL,
    subtitle        TEXT,
    authors_json    TEXT NOT NULL DEFAULT '[]',
    publisher       TEXT,
    published_year  INTEGER,
    language        TEXT,
    page_count      INTEGER,
    description     TEXT,
    cover_path      TEXT,
    format          TEXT,                              -- hardcover|paperback|ebook|audiobook
    location_shelf  TEXT,
    condition       TEXT,
    acquired_at     INTEGER,
    price_cents     INTEGER,
    notes           TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_books_tenant ON books(tenant_id);
CREATE INDEX idx_books_library ON books(library_id);
CREATE INDEX idx_books_isbn13 ON books(isbn_13);

-- FTS5 mirror for full-text search
CREATE VIRTUAL TABLE books_fts USING fts5(
    title, subtitle, authors, description, notes, isbn,
    content='', tokenize="unicode61 remove_diacritics 2"
);

-- Loans
CREATE TABLE loans (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    book_id             TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    borrower_name       TEXT NOT NULL,
    borrower_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    lent_at             INTEGER NOT NULL,
    due_at              INTEGER,
    returned_at         INTEGER,
    notes               TEXT
);
CREATE INDEX idx_loans_tenant ON loans(tenant_id);
CREATE INDEX idx_loans_book ON loans(book_id);
CREATE INDEX idx_loans_open ON loans(tenant_id) WHERE returned_at IS NULL;

-- Wishlist (per user)
CREATE TABLE wishlist (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    isbn        TEXT,
    title       TEXT NOT NULL,
    authors     TEXT,
    source_url  TEXT,
    priority    INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_wishlist_user ON wishlist(user_id);

-- Reading log
CREATE TABLE reading_log (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    started_at  INTEGER,
    finished_at INTEGER,
    rating      INTEGER,
    review      TEXT
);
CREATE INDEX idx_reading_user ON reading_log(user_id);
CREATE INDEX idx_reading_book ON reading_log(book_id);

-- Tags & joins
CREATE TABLE tags (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT,
    UNIQUE(tenant_id, name)
);
CREATE TABLE book_tags (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
);

-- Audit log: append-only. No UPDATE/DELETE allowed by app code.
CREATE TABLE audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id       TEXT NOT NULL,
    user_id         TEXT,
    device_id       TEXT,
    action          TEXT NOT NULL,                    -- e.g. book.create, device.revoke
    entity_type     TEXT,
    entity_id       TEXT,
    before_json     TEXT,
    after_json      TEXT,
    ip              TEXT,
    ts              INTEGER NOT NULL
);
CREATE INDEX idx_audit_tenant_ts ON audit_log(tenant_id, ts DESC);
CREATE INDEX idx_audit_entity ON audit_log(tenant_id, entity_type, entity_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS book_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS reading_log;
DROP TABLE IF EXISTS wishlist;
DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS books_fts;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS libraries;
DROP TABLE IF EXISTS pairing_tokens;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
-- +goose StatementEnd
