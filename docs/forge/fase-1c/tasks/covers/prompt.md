Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Copertine lato server

## Obiettivo

Salvare, servire e scaricare le copertine. Logica in `crates/bookeeper-core/src/covers.rs`, rotte in `api/covers.rs`. Colonne `books.cover_file` e `books.cover_color` già presenti.

## Elaborazione (funzione pura in `covers.rs`)

```rust
pub struct Processed { pub jpeg: Vec<u8>, pub color: String }   // color: "#rrggbb"
/// Decodifica JPEG, PNG o WebP; rifiuta il resto e le immagini sotto 80×80 o sopra 12.000 px di lato.
pub fn process(bytes: &[u8]) -> Result<Processed, CoverError>;
```

- Riconosci il formato dai byte, mai dal nome o dal `Content-Type`.
- Ridimensiona perché il lato lungo sia al più 1.200 px, senza ingrandire; ricodifica in JPEG qualità 85. I metadati dell'originale (EXIF) non sopravvivono.
- Colore dominante: riduci a 32×32, scarta i pixel quasi bianchi e quasi neri se ne restano almeno il 10%, fai la media. Deterministico.
- Prima di decodificare, controlla le dimensioni dichiarate: un'immagine che dichiara più di 40 megapixel è rifiutata senza allocare.

## Rotte

- `PUT /books/{id}/cover`: corpo = byte dell'immagine, al più 5 MB (`util::read_body`). Salva in `covers_dir/<id del libro>.jpg` scrivendo prima un file temporaneo nella stessa cartella e poi rinominando. Aggiorna `cover_file`, `cover_color`, `updated_at`; audit `book.cover`. Immagine non valida → 400 `unsupported_image`.
- `POST /books/{id}/cover/fetch` con `{ "candidates": [url] }` (1–8): prova gli URL in ordine, il primo che dà un'immagine valida vince → come sopra, risposta con `source_url`. Nessuno valido → 422 `cover_fetch_failed`.
- `GET /books/{id}/cover`: 200 `image/jpeg` con `ETag` (hash del file) e `Cache-Control: private, max-age=86400`; `If-None-Match` uguale → 304. Senza copertina → 404 `cover_not_found`.
- `DELETE /books/{id}/cover`: toglie file e colonne → 204, anche se non c'era; audit `book.cover_delete` solo se c'era.
- Eliminare un libro elimina anche il suo file: aggiungi la pulizia a `DELETE /books/{id}` e a `batch-delete` in `api/books.rs`, dopo il commit; un file che non si riesce a cancellare non fa fallire la richiesta.

## Scaricamento protetto (`covers::fetch_guarded`)

Gli URL arrivano dall'utente: senza controlli sarebbe un modo per far fare al server richieste verso la rete interna.

- Solo `https://`, porta 443, niente credenziali nell'URL.
- Risolvi il nome e rifiuta se **uno qualsiasi** degli indirizzi è privato, di loopback, link-local, multicast, non specificato o IPv6 locale (`fc00::/7`, `fe80::/10`, `::1`, IPv4 mappato). Poi collegati proprio all'indirizzo controllato, così una seconda risoluzione DNS non può cambiarlo.
- Niente reindirizzamenti automatici: seguili a mano, al più 3, ripetendo ogni controllo a ogni salto.
- Limite di 10 secondi in tutto e di 5 MB, interrompendo la lettura appena superato, anche senza `Content-Length`.
- Con `state.allow_private_fetch == true` (solo nei test) sono ammessi anche `http://` e gli indirizzi privati; tutti gli altri limiti restano.

## Test (`crates/bookeeper-core/tests/covers_api.rs`)

Immagini di prova generate nel test con `image`. Server locale su `127.0.0.1:0` per gli scaricamenti.

- Elaborazione: `jpeg_png_and_webp_are_accepted`; `gif_text_and_truncated_files_are_rejected`; `large_images_are_downscaled_to_1200`; `small_images_are_not_upscaled`; `tiny_images_are_rejected`; `declared_huge_dimensions_are_rejected_before_decoding`; `dominant_colour_of_a_red_image_is_red`; `output_has_no_exif`.
- Rotte: `upload_then_get_round_trips`; `get_supports_etag`; `get_without_cover_is_cover_not_found`; `upload_over_five_megabytes_is_payload_too_large`; `upload_of_garbage_is_unsupported_image`; `delete_is_idempotent`; `deleting_the_book_deletes_the_file`; `batch_delete_deletes_the_files`; `book_out_carries_the_colour` (in `GET /books/{id}`); `other_library_gets_not_found`; `guest_can_get_but_not_change`; `routes_need_a_token`; `mutations_are_audited`.
- Scaricamento: `fetch_takes_the_first_valid_candidate` (il primo dà 404, il secondo testo, il terzo un'immagine); `fetch_with_no_valid_candidate_is_cover_fetch_failed`; `fetch_stops_reading_at_the_size_limit` (il server manda 6 MB senza `Content-Length`); `fetch_follows_at_most_three_redirects`.
- Guardia, con `allow_private_fetch = false`: `guard_rejects_http_and_other_ports`; `guard_rejects_loopback_private_and_link_local` (`127.0.0.1`, `10.0.0.1`, `192.168.1.1`, `169.254.169.254`, `[::1]`, `[fd00::1]`, `[::ffff:127.0.0.1]`); `guard_rejects_credentials_in_the_url`; `guard_rechecks_redirect_targets`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test covers_api` passa con tutti i test elencati, senza accesso alla rete esterna.
- `cargo test -p bookeeper-core --test books_api` passa ancora.
- Cambiano solo `covers.rs`, `api/covers.rs`, `api/books.rs`, `tests/covers_api.rs`.
- Nessun nome di file viene da testo dell'utente.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
