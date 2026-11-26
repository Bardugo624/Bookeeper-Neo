ALTER TABLE pairing_codes ADD COLUMN id TEXT;
CREATE UNIQUE INDEX idx_pairing_codes_id ON pairing_codes(id) WHERE id IS NOT NULL;
