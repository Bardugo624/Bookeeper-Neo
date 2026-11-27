# Homepage screenshots

Real screenshots of Bookeeper 2.1.0 on a synthetic demo library ("Famiglia Rossi": Giulia, Marco, Sofia, Leo;
4 rooms, 5 furniture units, 80 pre-1955 classics, loans to invented friends, a wishlist, per-person reading).
No real person's data, no ISBNs, no cover images: the app draws its own placeholder covers and spines, and
nothing triggers an online lookup.

Output: `apps/site/public/shots/<name>-light.png` and `<name>-dark.png`.

| Name | Viewport | What it shows |
| --- | --- | --- |
| `desktop-library` | 1440x900 @2x | Catalogue grid (Libri) |
| `desktop-shelf` | 1440x900 @2x | "Dov'è?": Libreria grande, ripiano 3, spine of *Il fu Mattia Pascal* highlighted |
| `desktop-book` | 1440x900 @2x | Book detail with 3D cover, reading status, "Chi lo legge" per person |
| `desktop-loans` | 1440x900 @2x | Loans, one overdue |
| `desktop-stats` | 1440x900 @2x | Statistiche, Libreria tab |
| `desktop-reading` | 1440x900 @2x | Statistiche, Lettura tab (books read per month) |
| `phone-where` | 390x844 @3x | PWA "Dov'è?" for *Delitto e castigo* (Vetrina dei classici, ripiano 2) |
| `phone-search` | 390x844 @3x | PWA search for "Pirandello" |

## How it works

- **Server**: the released `bookeeper-server` binary with a throwaway data dir, `BOOKEEPER_MDNS=off`, and
  `BOOKEEPER_PUBLIC_URL=https://libri.esempio.it` so no address in the UI says localhost. It serves the PWA.
- **Desktop UI**: `apps/desktop` run by Vite in plain-browser mode (`browserPlatform`, used when
  `__TAURI_INTERNALS__` is missing). The server sends no CORS headers, so `vite.desktop.config.mjs` (here, not
  the repo's config) proxies `/api` to the server and the app calls it same-origin.
- **Sign-in**: `capture.mjs` logs in through the API for each capture and writes the session to
  `localStorage` (`bookeeper.connections` for desktop, `bookeeper.mobile.session` for the PWA). No tour is
  pending for that connection, so no onboarding overlay appears.
- **Theme**: `localStorage['bookeeper.theme'] = 'light' | 'dark'`; both apps turn that into the `dark` class
  on `<html>` (the script checks the class before each shot). Locale is forced with
  `localStorage['bookeeper.locale'] = 'it'`. Reduced motion is on, fonts are awaited, the caret is hidden.

## Reproduce

Needs Node 22+, the repo's npm deps (`npm ci` at the root) and Playwright with Chromium (global install is fine).

```bash
REPO=$PWD                       # repo root
WORK=$(mktemp -d)               # anything outside the repo
cd "$WORK"
curl -sSLfO https://github.com/Bardugo624/Bookeeper-Neo/releases/download/v2.1.0/bookeeper-server-2.1.0-linux-amd64.tar.gz
tar xzf bookeeper-server-2.1.0-linux-amd64.tar.gz
mkdir data
BOOKEEPER_MDNS=off BOOKEEPER_BIND=127.0.0.1 BOOKEEPER_PUBLIC_URL=https://libri.esempio.it BOOKEEPER_DATA=$WORK/data \
  ./bookeeper-server-2.1.0-linux-amd64/bookeeper-server > server.log 2>&1 &
sleep 2
CODE=$(grep -o '[A-Z0-9]\{4\}-[A-Z0-9]\{4\}-[A-Z0-9]\{4\}' server.log)

# 1. seed the demo library (first setup + data); writes the demo login to demo-credentials.json
node "$REPO/apps/site/scripts/shots/seed.mjs" http://127.0.0.1:7842 "$CODE" "$WORK/demo-credentials.json"

# 2. desktop frontend in the browser, on :5173, proxying /api to the server (uses apps/desktop's Vite 7)
(cd "$REPO/apps/site/scripts/shots" && ../../../desktop/node_modules/.bin/vite --config vite.desktop.config.mjs > "$WORK/vite.log" 2>&1 &)
sleep 5

# 3. capture everything (or pass a shot name as 4th argument to redo one)
node "$REPO/apps/site/scripts/shots/capture.mjs" "$WORK/demo-credentials.json" "$REPO/apps/site/public/shots" http://localhost:5173/

# 4. stop
pkill -f "vite --config vite.desktop.config.mjs"; pkill -f bookeeper-server
```

The seed is meant for an empty server: start again from an empty `data` dir to re-run it. Dates are relative
to the day you seed, so loan dates and the monthly reading chart move with it.
