-- +goose Up
-- +goose StatementBegin

-- label_code: codice numerico stabile dello scaffale (zzzz nelle etichette
-- stampabili). Gli id sono UUID e non stampabili in un DataMatrix compatto;
-- questo è un ordinale per-tenant assegnato una volta e mai riusato.
ALTER TABLE shelves ADD COLUMN label_code INTEGER;

-- Backfill: ordinale per tenant in ordine di creazione.
UPDATE shelves SET label_code = (
    SELECT COUNT(*) FROM shelves s2
     WHERE s2.tenant_id = shelves.tenant_id
       AND (s2.created_at < shelves.created_at
            OR (s2.created_at = shelves.created_at AND s2.id <= shelves.id))
);

CREATE UNIQUE INDEX idx_shelves_label_code
    ON shelves(tenant_id, label_code) WHERE label_code IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_shelves_label_code;
ALTER TABLE shelves DROP COLUMN label_code;
-- +goose StatementEnd
