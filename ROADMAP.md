# Roadmap — Bookeeper Neo verso la monetizzazione

Obiettivo: Free (locale) · Pro (una tantum/annuale) · Cloud (abbonamento).
Ordinata per dipendenze: ogni fase produce qualcosa di rilasciabile da solo.
Stime: sviluppatore singolo, settimane-uomo indicative.

---

## Fase 0 — Decisioni fondanti (niente codice) — ~1 settimana

Bloccano tutto il resto; costano zero righe ma vanno scritte nero su bianco.

| # | Decisione | Output |
| --- | --- | --- |
| 0.1 | **Licenza del codice**: da MIT a proprietario, oppure "core MIT + moduli Pro proprietari" (repo separato `bookeeper-pro`), oppure BSL. Da fare ORA, prima di contributor esterni. | LICENSE aggiornata + nota nel README |
| 0.2 | **Merchant of record**: Paddle vs Lemon Squeezy (IVA UE gestita da loro, licensing API inclusa). Aprire l'account richiede giorni di review: partire subito. | Account attivo in sandbox |
| 0.3 | **Pricing**: Free = locale 1 dispositivo · Pro ~34€ una tantum con 1 anno di update · Cloud ~4€/mese famiglia. | Pagina pricing in bozza |
| 0.4 | **EULA + Privacy Policy** (il Cloud tratta dati personali → GDPR: registro trattamenti, DPA con i provider). | Documenti in `docs/legal/` |

---

## Fase 1 — Fondamenta prodotto — ~3-4 settimane

Prerequisiti di vendibilità. Nessuna dipendenza dal licensing: partono subito.

### 1.1 Import / Export (il gancio di adozione) ✅ FATTO
- **Backend**: endpoint `POST /api/v1/import` (multipart CSV) con parser per
  Goodreads CSV, Calibre (metadata.db o CSV), LibraryThing TSV; dry-run che
  ritorna anteprima + conflitti; import batch transazionale con dedupe ISBN.
  Endpoint `GET /api/v1/export` (JSON completo + CSV) — già quasi gratis: i
  dati sono tutti in tabelle pulite.
- **Frontend**: wizard in Impostazioni → "Importa/Esporta": upload → anteprima
  (n libri, duplicati, campi non mappati) → conferma → progress. Riusare lo
  stile wizard della LoginView.
- Uscita: da Goodreads a Bookeeper in 2 minuti.

### 1.2 Backup & Restore ✅ FATTO (dump JSON tenant-scoped invece di VACUUM INTO: il DB server è multi-tenant)
- **Backend**: endpoint `POST /api/v1/backup` che produce uno zip
  (SQLite `VACUUM INTO` + covers) e `POST /restore` (solo owner, con
  conferma distruttiva). In locale: scheduling automatico (ogni N giorni,
  rotazione ultimi 5) scritto in `%APPDATA%/Bookeeper/backups`.
- **Frontend**: pannello Impostazioni → "Backup": ultimo backup, bottone
  manuale, restore con doppia conferma. Toast al completamento.
- Nota: il backup **cloud** automatico è feature Pro (fase 3).

### 1.3 i18n ✅ FATTO (frontend; error codes backend rimandati)
- **Frontend**: vue-i18n; estrarre le stringhe (sono tutte hardcoded in
  italiano); lingue: it, en. Selettore in Impostazioni + auto da locale OS.
- **Backend**: i messaggi d'errore user-facing passano a codici
  (`error_code`) che il client traduce; i log restano com'è.
- Meccanico ma lungo: farlo PRIMA delle feature nuove, non dopo.

### 1.4 Onboarding ✅ FATTO (primo-libro guidato al posto della libreria demo, scelta utente)
- **Frontend**: primo avvio post-setup → tour leggero (3 hint contestuali,
  non un carosello) + bottone "carica libreria demo" (20 libri finti,
  eliminabili in blocco). Empty state di ogni vista già curati nel restyle.

---

## Fase 2 — Licensing & DRM — ~2-3 settimane

Il principio: la licenza si verifica offline, il **valore** si eroga online.

### 2.1 Modulo licenze (nuovo package `server/pkg/license` condiviso)
- Formato: payload JSON firmato **Ed25519** →
  `{email, tier, issued_at, updates_until, seat_limit}` + firma, codificato
  base32 a blocchi (`BKPR-XXXX-...`). Chiave privata offline (tua), pubblica
  compilata nel binario.
- **Desktop (Go)**: `license.Verify(key)` pura, nessuna rete; stato persistito
  accanto a identity.json. Binding Wails `ActivateLicense`, `GetLicenseInfo`.
- **Frontend**: Impostazioni → "Licenza": stato (Free/Pro, update fino a...),
  campo inserimento chiave, link acquisto. Gating UI: le feature Pro visibili
  ma con lock + CTA (upsell onesto, niente dark pattern).
- Il MoR (Paddle/LS) genera le chiavi via webhook → mini-servizio
  `license-issuer` (può essere una Lambda/Worker) che firma e mail-a la chiave.

### 2.2 Entitlement lato server (dove il crack non arriva)
- Endpoint tuo (nuovo servizio o sul futuro Cloud): `POST /entitlement/check`
  → dato license key ritorna `{valid, tier, updates_until}` firmato con TTL.
- Le feature che DIPENDONO da servizi tuoi (backup cloud, sync, quota lookup)
  verificano l'entitlement server-side ad ogni uso. Il binario patchato non
  ottiene nulla.

### 2.3 Update gating + firma degli update
- Il manifest `latest.json` passa da R2 statico a endpoint che richiede la
  licenza per i canali Pro; il manifest viene **firmato Ed25519** (oggi c'è
  solo SHA-256 dell'exe: aggiungere firma del manifest in
  `desktop/internal/updater`). Chi cracka resta alla versione crackata.
- Free continua a ricevere gli update Free.

### 2.4 Hardening leggero
- Build release con **garble** (offuscazione Go) — solo binari release, la CI
  di dev resta pulita.
- Niente anti-debug/packer aggressivi: falsi positivi antivirus > beneficio.

---

## Fase 3 — Bookeeper Cloud — ~4-6 settimane

Il server multi-tenant esiste già: qui si tratta di operarlo come servizio.

### 3.1 Provisioning self-service
- **Backend**: flusso "Crea su Bookeeper Cloud" = il flusso remoto attuale
  puntato ai tuoi server + un servizio `cloud-admin` che: crea il tenant al
  pagamento (webhook MoR), gestisce stato abbonamento (attivo/moroso/
  cancellato), sospende/riattiva.
- **Frontend**: quarta card nella LoginView → "Bookeeper Cloud (consigliato)":
  checkout MoR embedded → torna con tenant creato e pairing automatico
  (riusa il one-click remoto esistente).
- Infra: il deploy Caddy+server attuale, con backup gestiti (litestream o
  snapshot), un VPS medio regge centinaia di tenant SQLite.

### 3.2 Quote e protezione
- Rate limit per tenant sul bootstrap e sul lookup metadati (`golang.org/x/time/rate`,
  in-memory basta); limiti storage covers per tenant; audit già presente.
- Job di sospensione tenant morosi (grace period 14gg, mai cancellare dati
  senza export offerto).

### 3.3 Migrazione locale → Cloud (upgrade path critico)
- **Backend**: riusa backup/restore (1.2): `POST /migrate` sul Cloud accetta
  lo zip di backup del tenant locale.
- **Frontend**: Impostazioni → "Sposta su Cloud": backup → upload → nuovo
  pairing → il locale resta come copia di sola lettura fino a conferma.
- È il ponte Free→pagante più naturale che hai: curarlo come un flusso primo-cittadino.

### 3.4 Backup cloud per Pro self-hosted
- Upload cifrato client-side (age/NaCl secretbox, chiave dell'utente) verso
  il tuo storage S3/R2 con quota per licenza. Entitlement check server-side
  (2.2). Anche qui: chi cracka non ha lo storage.

---

## Fase 4 — Distribuzione & fiducia — ~2-3 settimane (in parallelo a 3)

- **Build macOS** (Wails: darwin/universal) + notarizzazione Apple
  (Developer ID, 99$/anno). Test su Sonoma+.
- **Code signing Windows**: certificato OV (Azure Trusted Signing è
  l'opzione economica attuale) integrato in `publish-desktop.ps1`.
- **Sito**: landing (pricing, screenshot, download), docs utente, changelog
  pubblico. Il registro brand (PRODUCT.md/DESIGN.md) si riusa pari pari.
- **Canale beta**: il campo `Channel` esiste già in version.go — attivare
  stable/beta nel manifest updater.
- Telemetria **opt-in** minimale (versione, OS, tier) per decidere con dati;
  crash report opt-in. Mai contenuti del catalogo.

---

## Fase 5 — Lancio — ~2 settimane

- Beta chiusa (10-20 utenti reali, import dei loro cataloghi veri = stress
  test dell'import).
- Pricing page live + acquisto Pro end-to-end in sandbox → produzione.
- Lancio: community lettori/self-hosting (r/selfhosted, HN Show, forum
  GoodReads-refugees), press kit.
- Post-lancio: SLA di risposta support, ciclo release mensile.

---

## Sequenza consigliata (dipendenze)

```
Fase 0 ──► Fase 1 (1.3 i18n per prima) ──► Fase 2 ──► Fase 3 ──► Fase 5
                                    └────► Fase 4 (in parallelo a 2-3)
```

Totale realistico: **4-5 mesi** part-time, ~3 mesi full-time.

## Cosa NON fare (deliberato)

- Cap sul numero di libri in Free: ostile, uccide il passaparola.
- DRM aggressivo client-side (anti-debug, packer): antivirus e paganti puniti.
- App store mobile nativa ora: la PWA companion basta finché il Cloud non tira.
- Postgres/microservizi: SQLite per tenant regge questo mercato per anni.

---

## Fase 6 — Backlog competitivo

Idee ordinate per pilastro strategico, con posizionamento tier e sforzo.
Regola di selezione: ogni feature deve o (a) sfruttare il moat fisico che i
concorrenti non hanno, o (b) creare un loop di passaparola, o (c) essere
direttamente monetizzabile. Le "nice to have" senza uno dei tre non entrano.

## Pilastro A — Lo scaffale fisico è il moat

Nessun concorrente (Goodreads, StoryGraph, Libib, BookBuddy, LibraryThing)
sa DOVE sta un libro in casa. Tutto ciò che rafforza il ponte
digitale→fisico è territorio solo nostro.

| Idea | Cosa | Tier | Sforzo |
| --- | --- | --- | --- |
| **"Dov'è?"** | Ricerca → lo scaffale si apre e il dorso lampeggia/si sfila (ShelfSvg ha già hover e slot). Il demo-killer da landing page. | Free | S |
| **Scan-a-scaffale** | Modalità mobile: scansiona i barcode di una mensola in sequenza → i libri si piazzano negli slot nell'ordine fisico reale. Cataloga E posiziona in un gesto. | Pro | M |
| **Dorso dal colore reale** | Il colore del dorso sullo scaffale estratto dalla cover scaricata (dominant color, client-side) invece che dal titolo. Lo scaffale virtuale somiglia a quello vero. | Free | S |
| **Etichette stampabili** | PDF di etichette scaffale/segnatura (con numero progressivo già esistente) per chi ordina fisicamente la biblioteca. | Pro | S |

## Pilastro B — Anti-Goodreads (lettura senza social)

StoryGraph ha vinto utenti solo dicendo "non siamo Amazon". Noi: "i tuoi
dati di lettura non sono un prodotto".

| Idea | Cosa | Tier | Sforzo |
| --- | --- | --- | --- |
| **Tracking lettura leggero** | Stato (da leggere/in lettura/letto), date, valutazione privata. Niente feed, niente follower. Prerequisito del resto del pilastro. | Free | M |
| **"Il tuo anno in libri"** | Wrap annuale generato client-side: immagine condivisibile (pagine lette, generi, scaffale dell'anno). Loop virale a scelta dell'utente = privacy-safe. | Free | M |
| **Consigli locali** | "Cosa leggere dopo" calcolato SUL client (generi/autori posseduti e non letti). Zero server, argomento marketing: "consigli senza profilo". | Pro | M |

## Pilastro C — Prestiti e famiglia (il caso d'uso che gli altri ignorano)

| Idea | Cosa | Tier | Sforzo |
| --- | --- | --- | --- |
| **Anti-doppio-acquisto** | In libreria: scan ISBN dal telefono → "ce l'hai già, scaffale Narrativa" in <1s, offline (indice locale nella PWA). IL momento wow raccontabile. | Free | M |
| **Promemoria prestiti** | Notifica/email quando un prestito supera la data. I prestiti esistono già; oggi sono senza denti. | Pro/Cloud | S |
| **Pagina del prestito** | Link condivisibile col vicino: cosa ha in prestito + nudge di restituzione gentile. Ogni prestito = un contatto che vede Bookeeper. | Cloud | M |
| **Wishlist regalabile** | Link pubblico read-only della wishlist ("cosa regalarmi") con spunta anonima anti-doppione. Compleanni/Natale = acquisizione utenti ciclica. | Cloud | M |
| **Profili famiglia** | "Di chi è" e "chi lo sta leggendo" per membro; vista bimbi. Multi-utente per tenant esiste già lato server. | Pro | M |

## Pilastro D — Mercato italiano prima (nicchia difendibile)

| Idea | Cosa | Tier | Sforzo |
| --- | --- | --- | --- |
| **Fonte SBN/OPAC** | Aggiungere l'OPAC SBN alle fonti di lookup: le edizioni italiane che Google Books non ha. Nessun concorrente internazionale lo farà mai. | Free | M |
| **Valore collezione** | Stima valore + export PDF per assicurazione/eredità (Libib lo fa pagare; i collezionisti pagano). | Pro | M |

## Pilastro E — Nerd cred (acquisizione via community self-hosted)

| Idea | Cosa | Tier | Sforzo |
| --- | --- | --- | --- |
| **API pubblica documentata** | L'API c'è già: documentarla + token API per tenant. Sblocca integrazioni di community (Obsidian, Home Assistant) a costo loro. | Free | S |
| **Stats di community privacy-preserving** | "I 100 libri più posseduti dagli utenti" via secure aggregation (opt-in). Whitepaper che nessun concorrente può scrivere. | Cloud | L |

## Ordine d'attacco suggerito

Dopo la Fase 1: **"Dov'è?"** (S, moat, demo) → **anti-doppio-acquisto**
(momento wow) → **tracking lettura** (abilita wrap+consigli) → **wishlist
regalabile** (primo loop di acquisizione) → resto a domanda.
