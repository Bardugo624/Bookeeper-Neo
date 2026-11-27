# `bk`: lo script di aiuto del progetto

`bk` raccoglie in un posto solo i comandi che servono per seguire la CI, vedere le versioni, compilare e pubblicare una release, gestire gli aggiornamenti su R2 e aggiornare la VPS. Parla con GitHub tramite `gh`.

## Prima di cominciare

1. **Installa GitHub CLI (`gh`).** Su Windows: `winget install GitHub.cli`. Su altri sistemi: <https://cli.github.com>.
2. **Collegati a GitHub:** `gh auth login`.
3. **Installa le dipendenze del progetto:** `npm ci`.
4. **Controlla che tutto sia a posto:** `npm run bk -- doctor`.

Serve Node 20 o più recente.

## Come si usa

- `npm run bk` apre un menu numerato: scrivi il numero del comando e premi Invio.
- `npm run bk -- <comando> [argomenti]` esegue subito il comando.
- `npm run bk -- help` elenca i comandi.

Se qualcosa non va, `bk` stampa `✗` con il motivo e, sulla riga dopo, `→` con la soluzione. Per vedere anche la traccia dello stack: `BK_DEBUG=1`.

## Comandi

### `status`

Mostra ramo, ultimo commit, se il ramo è su GitHub e la versione del repository. Poi gli ultimi 3 run di `ci.yml`, `release.yml` e `vps-deploy.yml`, le versioni dei canali `stable` e `beta` con la loro fonte (R2 o VPS) e la versione del server.

```
npm run bk -- status
```

### `ci`

Lavora sui run della CI del ramo in cui ti trovi.

```
npm run bk -- ci              # gli ultimi 10 run del ramo
npm run bk -- ci run          # avvia la CI e la segue fino alla fine
npm run bk -- ci watch [id]   # segue un run (senza id: l'ultimo del ramo)
npm run bk -- ci logs [id]    # i log dei passi falliti
npm run bk -- ci rerun [id]   # rilancia i passi falliti
```

`ci run` si ferma se il ramo non è ancora su GitHub: prima esegui `git push -u origin <ramo>`.

### `dist`

Stampa i link degli installer. Senza versione usa l'ultima stabile.

```
npm run bk -- dist
npm run bk -- dist 2.1.0
npm run bk -- dist 2.1.0 --download   # salva gli installer in dist/2.1.0/
```

I link arrivano dall'indice dei download su `updates.neokeeper.dev`; se non risponde, dalla release su GitHub. La cartella `dist/` non finisce in git.

### `doctor`

Controlla Node, `git`, `gh` (installato e collegato), l'accesso al repository, l'albero di lavoro pulito e `node_modules`. Ogni voce è segnata ✓ o ✗, con la soluzione. Esce con codice 1 se qualcosa manca.

```
npm run bk -- doctor
```

### `build`

Compila gli installer sulla CI senza pubblicare nulla. L'albero deve essere pulito e il ramo già su GitHub; va bene qualunque ramo. Alla fine chiede «Scarico gli installer in dist/?».

```
npm run bk -- build           # installer in dist/<versione>-<sha>/
```

### `release`

Pubblica una nuova versione. Devi essere su `main`, con l'albero pulito (può cambiare solo `CHANGELOG.md`) e il ramo già su GitHub.

```
npm run bk -- release patch   # anche minor, major, beta
npm run bk -- release 2.2.0   # una versione scritta da te
```

La prima volta, se manca la sezione in `CHANGELOG.md`, `bk` la aggiunge e si ferma: scrivi le novità e rilancia lo stesso comando. Poi aumenta la versione ovunque, fa il commit `Release <versione>`, lo invia, avvia la pubblicazione e controlla (fino a 15 minuti) che il canale mostri la nuova versione. La versione deve essere più alta di quelle pubblicate su `stable` e `beta`, e la release non deve esistere già su GitHub. Se la pubblicazione fallisce: `npm run bk -- ci logs <id>`.

### `updates`

Gestisce gli aggiornamenti serviti da R2.

```
npm run bk -- updates                              # canali, fonte e stato del rimando
npm run bk -- updates seed                         # copia su R2 quello che c'è oggi
npm run bk -- updates withdraw beta 2.2.0-beta.1   # ritira una versione (scrivi «ritira»)
npm run bk -- updates switch                       # la VPS rimanda i client a R2 (scrivi «deploy»)
npm run bk -- updates switch --off                 # la VPS torna a servire da sola (scrivi «deploy»)
```

### `deploy`

Aggiorna la VPS. Devi essere su `main`, con l'albero pulito e il ramo su GitHub. Chiede sempre di scrivere «deploy»: non c'è modo di saltare la domanda.

```
npm run bk -- deploy server   # poi controlla che la versione del server sia quella del repository
npm run bk -- deploy caddy    # poi controlla che i manifest sulla VPS rispondano
```

## Accendere R2

1. `npm run bk -- updates seed`: copia su R2 i manifest e gli installer attuali.
2. `npm run bk -- updates`: controlla che `stable` e `beta` rispondano da R2.
3. `npm run bk -- updates switch`: verifica che R2 sia pronto, accende il rimando, aggiorna Caddy e controlla che la VPS risponda 302 verso R2. Se R2 non è pronto, non cambia nulla; se il deploy fallisce, rimette il rimando a `off`.

**Tornare indietro:** `npm run bk -- updates switch --off` spegne il rimando, aggiorna Caddy e controlla che la VPS risponda 200. Per togliere una versione sbagliata: `updates withdraw`.

## Per i test

Gli indirizzi si possono cambiare con `BK_UPDATES_BASE`, `BK_VPS_BASE` e `BK_SERVER_URL`. I test usano un `gh` finto (`scripts/bk/fake-gh.mjs`) e server locali (`BK_POLL_MS` e `BK_POLL_TIMEOUT_MS` accorciano le attese): non toccano mai GitHub.
