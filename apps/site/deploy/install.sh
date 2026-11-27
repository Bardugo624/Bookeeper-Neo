#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/site-deploy.yml.
# Swaps in the new homepage files, then adds the homepage site to the host's Caddy.
# Every Caddy file is backed up first; on a failed validation all of it is restored.
set -eu

site_dir=/srv/neokeeper-site
upload=/tmp/neokeeper-site.tgz
site_file=/etc/caddy/neokeeper-site.caddy
cf=/etc/caddy/Caddyfile
stamp=$(date +%s)

echo "== files"
rm -rf "$site_dir.new"
mkdir -p "$site_dir.new"
tar -xzf "$upload" -C "$site_dir.new"
chmod -R a+rX "$site_dir.new"
rm -rf "$site_dir.old"
[ -d "$site_dir" ] && mv "$site_dir" "$site_dir.old"
mv "$site_dir.new" "$site_dir"
rm -f "$upload"
ls "$site_dir"

restore() {
  cp -p "$cf.bak.$stamp" "$cf"
  if [ -f "$site_file.bak.$stamp" ]; then cp -p "$site_file.bak.$stamp" "$site_file"; else rm -f "$site_file"; fi
  if [ -d "$site_dir.old" ]; then rm -rf "$site_dir"; mv "$site_dir.old" "$site_dir"; fi
}

echo "== caddy"
cp -p "$cf" "$cf.bak.$stamp"
[ -f "$site_file" ] && cp -p "$site_file" "$site_file.bak.$stamp"
install -m 644 /tmp/neokeeper-site.caddy "$site_file"
rm -f /tmp/neokeeper-site.caddy
grep -qxF 'import neokeeper-site.caddy' "$cf" || printf '\nimport neokeeper-site.caddy\n' >> "$cf"
# The service may read variables from this file; validation needs them too.
if [ -f /etc/caddy/cf.env ]; then set -a; . /etc/caddy/cf.env; set +a; fi
if caddy validate --config "$cf" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "caddy: reloaded (backups *.bak.$stamp)"
else
  tail -5 /tmp/caddy-validate.log
  restore
  echo "caddy: validation failed, everything restored"
  exit 1
fi
systemctl is-active caddy
sleep 3
# Served locally whatever the DNS says: Host header over plain HTTP gets Caddy's HTTPS redirect.
curl -s -o /dev/null -w 'www via local http: %{http_code}\n' -H 'Host: www.neokeeper.dev' http://127.0.0.1/
curl -fsS -o /dev/null -w 'app api: %{http_code}\n' https://app.neokeeper.dev/api/v1/health
