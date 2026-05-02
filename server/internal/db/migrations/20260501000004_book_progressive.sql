-- +goose Up
-- Numero progressivo per ordinare fisicamente i libri (es. inventario,
-- numerazione di catalogo). Nullable: i libri esistenti restano senza
-- numero finche' l'utente non lo assegna. UNIQUE per tenant quando valorizzato
-- (NULL multipli sono ammessi in SQLite UNIQUE, perfetto per slot opzionale).
--
-- Index dedicato per la query "qual e' il prossimo numero libero?"
-- (MAX(progressive_number) WHERE tenant_id = ?) usata dal form di
-- inserimento e dalle batch operations sugli scaffali.
ALTER TABLE books ADD COLUMN progressive_number INTEGER;

CREATE UNIQUE INDEX idx_books_progressive_unique
    ON books(tenant_id, progressive_number)
    WHERE progressive_number IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_books_progressive_unique;
ALTER TABLE books DROP COLUMN progressive_number;
