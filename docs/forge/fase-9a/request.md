# Richiesta

Messaggi del proprietario, alla lettera:

> * abbiamo un bucket R2 per distribuire gli update (poi ti fornirò il token e secret ma non in chat)
> * L'installer andrà brandizzato e customizzato
> * voglio uno script rapido con CLI multi opzione per gestire build/updates/CI e dist dal mio pc locale (nella repo clonata)

> comanda la CI, lo script. E' solo utilità quando faccio modifiche rapide senza PR

> per l'indirizzo seguirò l'opzione A updates.neokeeper
> e tu fai si che Caddy sulla VPS rimanda /updates/* a R2
> uno script Node nel repo va benissimo

Alla domanda sul ramo ha scelto: «Su main». Le modifiche rapide vanno direttamente su `main`; release e deploy partono solo da `main`.

> Procedi, sappi che essendo da remote control la creazione di update. E creare secret e var non può avvenire ora

Il dominio `updates.neokeeper.dev`, i secret e le variabili li crea il proprietario più avanti. Questo run costruisce tutto in modo che funzioni anche prima: senza i secret di R2 la release pubblica sulla VPS come oggi.

Il design approvato è `docs/superpowers/specs/2026-11-27-aggiornamenti-r2-e-script-bk-design.md`. L'installer brandizzato è un run successivo.
