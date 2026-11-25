#!/usr/bin/env bash
# Usage: scripts/smoke.sh <address> <setup-code>
# End-to-end check of a running server: library, book, pairing. Needs curl and jq.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "uso: $0 <indirizzo> <codice-di-setup>" >&2
  exit 2
fi
base="${1%/}"
case "$base" in http://* | https://*) ;; *) base="http://$base" ;; esac
code="$2"
api="$base/api/v1"

fail() {
  echo "errore al passo $1: $2" >&2
  exit 1
}

# call <step> <method> <path> [token] [body] -> sets $status and $body
call() {
  local step="$1" method="$2" path="$3" token="${4:-}" data="${5:-}" out
  local args=(-sS -k --max-time 20 -X "$method" -w '\n%{http_code}' -H 'Accept: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' --data "$data")
  out=$(curl "${args[@]}" "$api$path") || fail "$step" "richiesta non riuscita ($method $path)"
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

expect() { # <step> <expected status>
  [ "$status" = "$2" ] || fail "$1" "attesi HTTP $2, ricevuti $status"
}

step="1 health"
call "$step" GET /health
expect "$step" 200
[ "$(jq -r '.status' <<<"$body")" = "ok" ] || fail "$step" "stato diverso da ok"
echo "ok: health"

step="2 server"
call "$step" GET /server
expect "$step" 200
jq -e 'has("tls")' <<<"$body" >/dev/null || fail "$step" "manca il campo tls"
echo "ok: server (tls $(jq -r '.tls' <<<"$body"))"

step="3 setup"
payload=$(jq -n --arg c "$code" '{library_name:"Smoke", display_name:"Smoke", email:"smoke@example.invalid", password:"smoke-test-pass", setup_code:$c, device_name:"smoke-1", device_kind:"desktop"}')
call "$step" POST /setup "" "$payload"
expect "$step" 201
token1=$(jq -r '.session.access_token // empty' <<<"$body")
[ -n "$token1" ] || fail "$step" "nessun token nella risposta"
echo "ok: libreria e proprietario creati"

step="4 libro"
call "$step" POST /books "$token1" '{"title":"Smoke test","authors":["Smoke"]}'
expect "$step" 201
book_id=$(jq -r '.id // empty' <<<"$body")
[ -n "$book_id" ] || fail "$step" "nessun id libro"
call "$step" GET "/books/$book_id" "$token1"
expect "$step" 200
[ "$(jq -r '.title' <<<"$body")" = "Smoke test" ] || fail "$step" "titolo diverso"
echo "ok: libro creato e riletto"

step="5 codice di abbinamento"
call "$step" POST /pairing/codes "$token1"
expect "$step" 201
pair=$(jq -r '.code // empty' <<<"$body")
[ -n "$pair" ] || fail "$step" "nessun codice"
echo "ok: codice di abbinamento generato"

step="6 riscatto"
payload=$(jq -n --arg c "$pair" '{code:$c, device_name:"smoke-2", device_kind:"mobile"}')
call "$step" POST /pairing/redeem "" "$payload"
expect "$step" 200
token2=$(jq -r '.session.access_token // empty' <<<"$body")
[ -n "$token2" ] || fail "$step" "nessun token nella risposta"
echo "ok: secondo dispositivo abbinato"

step="7 lettura dal secondo dispositivo"
call "$step" GET "/books/$book_id" "$token2"
expect "$step" 200
[ "$(jq -r '.id' <<<"$body")" = "$book_id" ] || fail "$step" "libro diverso"
echo "ok: il secondo dispositivo legge il libro"

step="8 dispositivi"
call "$step" GET /devices "$token1"
expect "$step" 200
n=$(jq -r '[.devices[] | select(.revoked_at == null)] | length' <<<"$body")
[ "$n" = "2" ] || fail "$step" "attesi 2 dispositivi, trovati $n"
echo "ok: 2 dispositivi"
