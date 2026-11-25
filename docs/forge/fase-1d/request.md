# Richiesta

Richiesta del proprietario, alla lettera:

> Come sempre, prima integra, poi tutti i P3 poi prossima fase

Run **1D**, l'ultimo della fase 1 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. **Difetti P3 rimasti dal run 1C corretti**, tutti e quattordici, più il plausibile sulle copertine: backup programmato con file datati nel futuro; `authors_json` non validato al ripristino; connessione al database tenuta durante compressione e ricodifica; `headers` ignorati dal comando Tauri; larghezze dei caratteri accentati nelle etichette; entità HTML, anno, risultato vuoto e limite di dimensione nei fornitori di lookup; `<` isolato trattato come tag; `read_body` che risponde sempre 413; riconoscimento di LibraryThing; doppioni dentro lo stesso file di import; `PUT` e `DELETE` concorrenti della copertina.
2. **TLS del server autonomo** (design §6.4): modalità `off`, `self` (certificato autogenerato, impronta e frase di verifica) e `acme` (Let's Encrypt dato un dominio).
3. **Scoperta in rete** (design §6.4): il server si annuncia via mDNS; esiste la funzione che elenca i server trovati.
4. **Configurazione** (design §6.5) per flag o variabili: cartella dati, porta, modalità TLS, dominio, indirizzo pubblico, mDNS. Il server dice ai client se il telefono è utilizzabile (D7).
5. **Docker** (design §6.5): immagine da sorgente, `docker-compose.yml` con un servizio, un volume, una porta. Da `docker run` a libreria creata e dispositivo abbinato senza file di configurazione, provato da uno script.
6. **Workflow di rilascio** su tag: binari statici del server per Linux amd64 e arm64, Windows, macOS; immagine Docker multi-architettura.
7. **Rimandi della fase 0 chiusi**: strati comuni applicati dopo l'unione dei router; risposte d'errore documentate in OpenAPI.

Fuori da 1D: installer desktop, manifest di aggiornamento, condivisione in rete dall'app desktop, lato client della fiducia nel certificato (fase 2); `docs/deploy.md` (fase 7).

## Limiti noti di questo ambiente

- L'emissione reale di un certificato ACME richiede un dominio pubblico: non è verificabile qui.
- Il multicast mDNS può non funzionare in un contenitore: la prova di andata e ritorno è un test `#[ignore]`.
- I workflow di GitHub non girano qui: si verificano i comandi che contengono, non il workflow.
