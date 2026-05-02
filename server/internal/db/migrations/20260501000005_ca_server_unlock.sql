-- +goose Up
-- Aggiunge un secondo slot di cifratura per la chiave privata della CA
-- tenant, basato su una "server key" persistente (/data/ca-server.key).
-- Permette al server di sbloccare automaticamente le CA all'avvio,
-- senza richiedere l'admin password ad ogni restart o ad ogni utente
-- non-admin che voglia abbinare un dispositivo mobile.
--
-- Il vecchio slot (ca_key_enc + ca_key_salt + ca_key_nonce, derivato da
-- admin password con Argon2id) resta come fallback / recovery, e viene
-- ancora usato dal flusso di bootstrap iniziale del desktop.
--
-- Nuovo slot: AES-256-GCM con chiave casuale a 32 byte tenuta in
-- /data/ca-server.key (chmod 0600). I tre campi sono nullable per
-- backward-compat con i tenant gia' bootstrappati: vengono popolati
-- al primo Unlock riuscito post-migrazione.
ALTER TABLE tenants ADD COLUMN ca_key_enc_server   BLOB;
ALTER TABLE tenants ADD COLUMN ca_key_nonce_server BLOB;

-- +goose Down
ALTER TABLE tenants DROP COLUMN ca_key_enc_server;
ALTER TABLE tenants DROP COLUMN ca_key_nonce_server;
