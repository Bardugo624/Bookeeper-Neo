# `bk`: lo script di aiuto del progetto

`bk` raccoglie in un posto solo i comandi che servono per seguire la CI, vedere le versioni e scaricare gli installer. Parla con GitHub tramite `gh`.

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

## Per i test

Gli indirizzi si possono cambiare con `BK_UPDATES_BASE`, `BK_VPS_BASE` e `BK_SERVER_URL`. I test usano un `gh` finto (`scripts/bk/fake-gh.mjs`) e server locali: non toccano mai GitHub.
