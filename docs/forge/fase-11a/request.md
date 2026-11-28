# Richiesta

Il proprietario: «Nella 2.3.1 metti sia fix sia la fase di ricerca ISBN completa (e relative UI con impeccable). Tutto in un colpo.»

Due parti in un solo giro:
- **Ricerca ISBN.** Oggi interroga Google Books (senza chiave: limite giornaliero 0), Anna's Archive (due mirror spariti, uno in vendita, uno dietro DDoS-Guard) e Open Library (copre poco i libri italiani). Con 9788804739494 (Banks, *Il ciclo della Cultura*, Mondadori 2021) non trova niente; il catalogo nazionale SBN lo trova. La chiave di Google Books è nel segreto GitHub `GOOGLE_BOOKS_API_KEY`. Anna's resta, ma non si mostra.
- **Hotfix del lettore:** i P3 rimasti della 10B4, le correzioni 3–6 della terza revisione (`docs/forge/fase-10b4b/REVISIONE.md`) e le note della quarta.
