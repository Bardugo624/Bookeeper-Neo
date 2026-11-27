#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-deploy.yml, from /opt/bookeeper.
# Starts the container, then runs caddy.sh to install the Caddy site.
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

bash /opt/bookeeper/caddy.sh
docker ps --format '{{.Names}}\t{{.Status}}'
