-- +goose Up
-- +goose StatementBegin

-- Fix per "fts cleanup failed" su DELETE/UPDATE di libri.
--
-- La tabella `books_fts` originale era creata come contentless FTS5
-- (`content=''`) senza l'opzione `contentless_delete=1`. In quella
-- modalità SQLite 3.43+ rifiuta qualsiasi `DELETE` o `UPDATE` con
-- l'errore "cannot DELETE from contentless fts5 table".
--
-- Soluzione: ricreare la tabella con `contentless_delete=1` e ripopolare
-- dai dati attuali in `books`. Lo schema delle colonne resta identico
-- (title, subtitle, authors, description, notes, isbn) e gli endpoint
-- API (INSERT/SELECT MATCH) continuano a funzionare invariati.

DROP TABLE IF EXISTS books_fts;

CREATE VIRTUAL TABLE books_fts USING fts5(
    title, subtitle, authors, description, notes, isbn,
    content='',
    contentless_delete=1,
    tokenize="unicode61 remove_diacritics 2"
);

-- Ripopola dai libri esistenti. authors e' JSON array → lo serializziamo
-- come stringa "raw" (lo split-by-comma non e' necessario perche' FTS5
-- tokenizza comunque). isbn unisce isbn_13 e isbn_10 separati da spazio
-- per replicare la logica di INSERT in api/books.go.
INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
SELECT
    rowid,
    COALESCE(title, ''),
    COALESCE(subtitle, ''),
    COALESCE(authors_json, ''),
    COALESCE(description, ''),
    COALESCE(notes, ''),
    TRIM(COALESCE(isbn_13, '') || ' ' || COALESCE(isbn_10, ''))
FROM books;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Down: torniamo allo schema originale (senza contentless_delete) e
-- ripopoliamo. NB: questa down porta indietro il bug — usare solo per
-- rollback di emergenza.
DROP TABLE IF EXISTS books_fts;

CREATE VIRTUAL TABLE books_fts USING fts5(
    title, subtitle, authors, description, notes, isbn,
    content='', tokenize="unicode61 remove_diacritics 2"
);

INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
SELECT
    rowid,
    COALESCE(title, ''),
    COALESCE(subtitle, ''),
    COALESCE(authors_json, ''),
    COALESCE(description, ''),
    COALESCE(notes, ''),
    TRIM(COALESCE(isbn_13, '') || ' ' || COALESCE(isbn_10, ''))
FROM books;

-- +goose StatementEnd
