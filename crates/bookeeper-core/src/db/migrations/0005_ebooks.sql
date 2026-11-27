CREATE TABLE book_files (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('epub','pdf','mobi','azw3','fb2','cbz')),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  koreader_hash TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(book_id, sha256));
CREATE INDEX idx_book_files_book ON book_files(book_id);
CREATE INDEX idx_book_files_sha256 ON book_files(sha256);
CREATE INDEX idx_book_files_koreader ON book_files(koreader_hash);

ALTER TABLE reading ADD COLUMN progress_percent REAL
  CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));
ALTER TABLE reading ADD COLUMN progress_at INTEGER;
ALTER TABLE reading ADD COLUMN progress_device_id TEXT;

CREATE TABLE reading_positions (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES book_files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cfi','koreader','kobo')),
  value TEXT NOT NULL,
  percent REAL,
  device_id TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, file_id, kind));
