// Package db opens the SQLite database with WAL + foreign keys enabled and
// runs embedded goose migrations on startup.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"path/filepath"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Open returns a *sql.DB pointing at <dataDir>/bookeeper.db with sane
// pragmas for a small server: WAL journal, foreign keys ON, busy_timeout 5s.
func Open(dataDir string) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)",
		filepath.Join(dataDir, "bookeeper.db"),
	)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite + WAL still serialises writes; one writer is fine, but allow a few
	// readers in flight.
	db.SetMaxOpenConns(8)
	if err := db.PingContext(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// Migrate applies all embedded migrations using goose.
func Migrate(db *sql.DB) error {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.Up(db, "migrations")
}
