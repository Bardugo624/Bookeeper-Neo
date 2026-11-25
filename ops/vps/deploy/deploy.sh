#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-deploy.yml, from /opt/bookeeper.
# Starts the container, then adds the two sites to the host's Caddy.
# The Caddyfile is backed up first and restored if validation fails.
set -eu
cd /opt/bookeeper

echo "== container"
docker compose up -d
for _ in $(seq 1 30); do
  s=$(docker inspect -f '{{.State.Health.Status}}' bookeeper)
  [ "$s" = healthy ] && break
  sleep 2
done
echo "health: $s"
[ "$s" = healthy ] || { docker logs --tail 20 bookeeper 2>&1 | grep -v 'Codice di setup'; exit 1; }
curl -fsS http://127.0.0.1:7842/api/v1/server; echo

echo "== caddy"
cf=/etc/caddy/Caddyfile
bak="$cf.bak.$(date +%s)"
cp -p "$cf" "$bak"
install -m 644 bookeeper.caddy /etc/caddy/bookeeper.caddy
grep -qxF 'import bookeeper.caddy' "$cf" || printf '\nimport bookeeper.caddy\n' >> "$cf"
# The service may read variables from this file; validation needs them too.
if [ -f /etc/caddy/cf.env ]; then set -a; . /etc/caddy/cf.env; set +a; fi
if caddy validate --config "$cf" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "caddy: reloaded (backup $bak)"
else
  tail -5 /tmp/caddy-validate.log
  cp -p "$bak" "$cf"
  rm -f /etc/caddy/bookeeper.caddy
  echo "caddy: validation failed, Caddyfile restored"
  exit 1
fi
systemctl is-active caddy
docker ps --format '{{.Names}}\t{{.Status}}'
