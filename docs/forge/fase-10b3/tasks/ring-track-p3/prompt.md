Leggi prima `docs/forge/fase-10b3/CONTRATTO.md`.

# Kit: l'anello vuoto si vede

## File
`packages/ui/src/book/ProgressRing.module.css` con il test dell'anello.

## Cosa fare
Sulla copertina della griglia, un libro in lettura allo 0% mostra un disco bianco vuoto, che sembra un'etichetta rotta: la traccia `--bk-inset` quasi non si vede sul disco `--bk-surface`. La traccia diventa `--bk-border-strong`, in tutti e due i temi. L'arco non cambia.

## Test
- `the_track_shows_on_the_surface`: la regola `.track` usa `--bk-border-strong`.

## Acceptance criteria
- `npm test -w @bookeeper/ui` passa.
