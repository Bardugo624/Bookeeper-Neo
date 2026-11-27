#!/usr/bin/env bash
# Executed on the VPS from /opt/bookeeper (deploy.sh or vps-deploy.yml target=caddy).
# Installs bookeeper.caddy into the host's Caddy. The Caddyfile is backed up first and
# restored if validation fails.
set -eu
cd /opt/bookeeper

echo "== caddy"
cf=/etc/caddy/Caddyfile
bak="$cf.bak.$(date +%s)"
cp -p "$cf" "$bak"
site=/etc/caddy/bookeeper.caddy
sitebak="$site.bak.$(date +%s)"
if [ -f "$site" ]; then cp -p "$site" "$sitebak"; fi
install -m 644 bookeeper.caddy "$site"
grep -qxF 'import bookeeper.caddy' "$cf" || printf '\nimport bookeeper.caddy\n' >> "$cf"
# The service may read variables from this file; validation needs them too.
if [ -f /etc/caddy/cf.env ]; then set -a; . /etc/caddy/cf.env; set +a; fi
if caddy validate --config "$cf" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "caddy: reloaded (backup $bak)"
else
  tail -5 /tmp/caddy-validate.log
  cp -p "$bak" "$cf"
  if [ -f "$sitebak" ]; then cp -p "$sitebak" "$site"; else rm -f "$site"; fi
  echo "caddy: validation failed, Caddyfile restored"
  exit 1
fi
systemctl is-active caddy
