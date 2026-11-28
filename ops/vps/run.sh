#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml. Read-only: writes nothing.
set -u

docker ps -a
free -m
df -h /
curl -sS -o /dev/null -w 'updates redirect: %{http_code} -> %{redirect_url}\n' https://app.neokeeper.dev/updates/stable/latest.json

# The ISBN sources as the server reaches them (its user agent), for a Mondadori ISBN: status, final address, first bytes.
isbn=9788804739494
for url in \
  "https://www.googleapis.com/books/v1/volumes?q=isbn:$isbn" \
  "https://openlibrary.org/api/books?bibkeys=ISBN:$isbn&jscmd=data&format=json" \
  "https://opac.sbn.it/opacmobilegw/search.json?isbn=$isbn" \
  "https://annas-archive.gl/isbn/$isbn" \
  "https://annas-archive.li/isbn/$isbn"; do
  out=$(curl -sS -L --max-redirs 3 --max-time 15 -A 'Bookeeper/2.2.0' -w '\n__%{http_code} %{url_effective}' "$url" 2>&1)
  echo "isbn source: ${out##*__}"
  printf '%s' "${out%__*}" | tr -s '\n\t ' ' ' | head -c 300
  echo
done
