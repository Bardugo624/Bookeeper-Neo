CREATE TABLE libraries (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE users (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  email TEXT, password_hash TEXT, display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','guest')),
  created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX idx_users_email ON users(library_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_one_owner ON users(library_id) WHERE role = 'owner';

CREATE TABLE devices (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('desktop','mobile')),
  refresh_hash TEXT NOT NULL UNIQUE, refresh_prev_hash TEXT,
  paired_at INTEGER NOT NULL, last_seen INTEGER, revoked_at INTEGER);

CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('device','invite')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin','member','guest')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL,
  CHECK ((kind = 'device' AND user_id IS NOT NULL AND role IS NULL)
      OR (kind = 'invite' AND user_id IS NULL AND role IS NOT NULL)));

CREATE TABLE rooms (id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(library_id, name));

CREATE TABLE shelves (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL, name TEXT NOT NULL,
  rows INTEGER NOT NULL CHECK (rows BETWEEN 1 AND 12),
  slots_per_row INTEGER NOT NULL CHECK (slots_per_row BETWEEN 5 AND 60),
  color TEXT NOT NULL DEFAULT 'sage'
    CHECK (color IN ('sage','terracotta','night','plum','amber','graphite')),
  icon TEXT, label_code INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(library_id, label_code));

CREATE TABLE books (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  isbn_13 TEXT, isbn_10 TEXT, title TEXT NOT NULL, subtitle TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]', publisher TEXT, published_year INTEGER,
  language TEXT, page_count INTEGER, description TEXT, genre TEXT,
  format TEXT CHECK (format IN ('hardcover','paperback','ebook','audiobook')),
  progressive_number INTEGER, owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  condition TEXT, acquired_at INTEGER, price_cents INTEGER, notes TEXT,
  cover_file TEXT, cover_color TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX idx_books_isbn13 ON books(library_id, isbn_13);
CREATE INDEX idx_books_genre ON books(library_id, genre);
CREATE UNIQUE INDEX idx_books_progressive ON books(library_id, progressive_number)
  WHERE progressive_number IS NOT NULL;

CREATE VIRTUAL TABLE books_fts USING fts5(
  title, subtitle, authors, description, notes, isbn,
  content='', contentless_delete=1, tokenize="unicode61 remove_diacritics 2");

CREATE TABLE shelf_books (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  spine_width INTEGER CHECK (spine_width BETWEEN 1 AND 3),
  updated_at INTEGER NOT NULL, UNIQUE(shelf_id, row_index, slot_index));

CREATE TABLE loans (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL, borrower_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  lent_at INTEGER NOT NULL, due_at INTEGER, returned_at INTEGER, notes TEXT);
CREATE UNIQUE INDEX idx_loans_one_open ON loans(book_id) WHERE returned_at IS NULL;

CREATE TABLE wishlist (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  isbn TEXT, title TEXT NOT NULL, authors TEXT, source_url TEXT,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
  notes TEXT, created_at INTEGER NOT NULL);

CREATE TABLE reading (
  id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('to_read','reading','read','abandoned')),
  started_at INTEGER, finished_at INTEGER,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5), note TEXT,
  updated_at INTEGER NOT NULL, UNIQUE(user_id, book_id));

CREATE TABLE tags (id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'sage', UNIQUE(library_id, name));
CREATE TABLE book_tags (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (book_id, tag_id));

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, library_id TEXT NOT NULL,
  user_id TEXT, device_id TEXT, action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, detail_json TEXT, ip TEXT, at INTEGER NOT NULL);
CREATE INDEX idx_audit_library_at ON audit_log(library_id, at DESC);

CREATE TABLE server_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE INDEX idx_users_library ON users(library_id);
CREATE INDEX idx_devices_library ON devices(library_id);
CREATE INDEX idx_rooms_library ON rooms(library_id);
CREATE INDEX idx_shelves_library ON shelves(library_id);
CREATE INDEX idx_books_library ON books(library_id);
CREATE INDEX idx_loans_library ON loans(library_id);
CREATE INDEX idx_wishlist_library ON wishlist(library_id);
CREATE INDEX idx_reading_library ON reading(library_id);
CREATE INDEX idx_tags_library ON tags(library_id);
