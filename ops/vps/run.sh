#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml.
# Current content: serve desktop updates from /opt/bookeeper/updates through Caddy.
# The Caddy site file is backed up first and restored if validation fails.
set -eu

install -d -m 755 /opt/bookeeper/updates /opt/bookeeper/updates/stable /opt/bookeeper/updates/beta /opt/bookeeper/updates/files
printf 'ok\n' > /opt/bookeeper/updates/files/probe.txt
chmod -R a+rX /opt/bookeeper/updates

site=/etc/caddy/bookeeper.caddy
bak="$site.bak.$(date +%s)"
cp -p "$site" "$bak"
cat > "$site" <<'CADDY'
mobile.neokeeper.dev, app.neokeeper.dev {
	encode zstd gzip

	# Desktop updates: read-only static files, no directory listing.
	handle_path /updates/* {
		root * /opt/bookeeper/updates
		@manifest path /stable/latest.json /beta/latest.json
		header @manifest Cache-Control "no-cache"
		@files path /files/*
		header @files Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	reverse_proxy 127.0.0.1:7842
}
CADDY
if [ -f /etc/caddy/cf.env ]; then set -a; . /etc/caddy/cf.env; set +a; fi
if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "caddy: reloaded (backup $bak)"
else
  tail -5 /tmp/caddy-validate.log
  cp -p "$bak" "$site"
  echo "caddy: validation failed, site file restored"
  exit 1
fi
systemctl is-active caddy
sleep 2
curl -fsS -o /dev/null -w 'probe %{http_code}\n' https://app.neokeeper.dev/updates/files/probe.txt
curl -fsS -o /dev/null -w 'api %{http_code}\n' https://app.neokeeper.dev/api/v1/health
docker ps --format '{{.Names}}\t{{.Status}}'
