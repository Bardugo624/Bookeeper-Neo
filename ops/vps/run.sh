#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml.
# Current content: read-only survey. It changes nothing.
set -u

echo "== system"
uname -srm
. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-}"
echo "cpu: $(nproc)  mem: $(free -m | awk 'NR==2{print $2" MB total, "$7" MB available"}')"
df -h / | tail -1

echo "== listening sockets"
ss -ltnpH 2>/dev/null | awk '{print $4, $6}' | sort -u

echo "== docker"
if command -v docker >/dev/null; then
  docker --version
  docker compose version 2>/dev/null || echo "compose plugin: missing"
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
else
  echo "docker: not installed"
fi

echo "== caddy"
systemctl is-active caddy 2>/dev/null || true
if command -v caddy >/dev/null; then caddy version; fi
for f in /etc/caddy/Caddyfile; do
  if [ -f "$f" ]; then
    echo "-- $f: site addresses and imports only"
    grep -nE '^[^[:space:]#}][^{]*\{[[:space:]]*$|^[[:space:]]*import ' "$f" || true
    ls -la /etc/caddy
  fi
done
if command -v docker >/dev/null; then
  for c in $(docker ps --format '{{.Names}}' | grep -i caddy || true); do
    echo "-- container $c: mounts"
    docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$c"
    docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$c"
  done
fi

echo "== port 7842"
ss -ltnH 'sport = :7842' | grep -q . && echo "in use" || echo "free"
