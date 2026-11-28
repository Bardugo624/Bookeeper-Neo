CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  file_sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('highlight','bookmark')),
  cfi TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  color TEXT CHECK (color IS NULL OR color IN ('amber','sage','terracotta','night')),
  note TEXT,
  percent REAL NOT NULL CHECK (percent >= 0 AND percent <= 100),
  chapter TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER);
CREATE INDEX idx_annotations_user_book ON annotations(user_id, book_id, updated_at);
