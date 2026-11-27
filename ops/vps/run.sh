#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml. Read-only: writes nothing.
set -u

docker ps -a
free -m
df -h /
curl -sS -o /dev/null -w 'updates redirect: %{http_code} -> %{redirect_url}\n' https://app.neokeeper.dev/updates/stable/latest.json
