-- +goose Up
-- +goose StatementBegin

-- Shelves: virtual furniture units that group books visually.
-- Capacity is derived: rows * slots_per_row.
CREATE TABLE shelves (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    rows          INTEGER NOT NULL CHECK (rows BETWEEN 1 AND 12),
    slots_per_row INTEGER NOT NULL CHECK (slots_per_row BETWEEN 5 AND 60),
    color         TEXT NOT NULL DEFAULT 'sage',
    icon          TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_shelves_tenant ON shelves(tenant_id);

-- Per-book placement: each book occupies at most one slot. Uniqueness on
-- (shelf, row, slot) prevents two books from sharing the same physical
-- position. Removing a shelf cascades and frees the books.
CREATE TABLE shelf_books (
    book_id      TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    shelf_id     TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    row_index    INTEGER NOT NULL CHECK (row_index >= 0),
    slot_index   INTEGER NOT NULL CHECK (slot_index >= 0),
    spine_color  TEXT,
    spine_width  INTEGER NOT NULL DEFAULT 1 CHECK (spine_width BETWEEN 1 AND 3),
    updated_at   INTEGER NOT NULL,
    UNIQUE (shelf_id, row_index, slot_index)
);
CREATE INDEX idx_shelf_books_shelf ON shelf_books(shelf_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS shelf_books;
DROP TABLE IF EXISTS shelves;
-- +goose StatementEnd
