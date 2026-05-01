-- +goose Up
-- +goose StatementBegin

-- Adds a free-form `genre` column to the books table. Stored as TEXT
-- (NULL when unknown) so the user can type anything: tassonomie rigide
-- non hanno senso per una libreria familiare. Le statistiche dashboard
-- raggrupperanno per valore esatto (case-sensitive) dopo TRIM.
ALTER TABLE books ADD COLUMN genre TEXT;

-- Indice non univoco per accelerare GROUP BY genre nelle aggregazioni
-- dashboard e i futuri filtri "tutti i libri di Fantasy".
CREATE INDEX idx_books_genre ON books(tenant_id, genre);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_books_genre;
ALTER TABLE books DROP COLUMN genre;
-- +goose StatementEnd
