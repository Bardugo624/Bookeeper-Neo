#!/usr/bin/env bash
# gen-serve-config.sh — render deploy/tailscale-serve.json from .env values.
# Idempotent: just re-rendered on every run.
#
# Why a static file instead of an inline entrypoint heredoc?
# - The heredoc inside the compose entrypoint was triggering a busybox
#   "ambiguous redirect" in some tailscale image revisions; bind-mounting
#   a pre-rendered file is robust and image-agnostic.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
OUT="$DEPLOY_DIR/tailscale-serve.json"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${TS_HOSTNAME:?TS_HOSTNAME unset in .env}"
: "${TAILNET:?TAILNET unset in .env}"

# Tailscale Serve config: tailnet HTTPS :443 → http://bookeeper-server:7843
# (the bootstrap surface; mTLS is NOT applied on the tailnet side because
# the tailnet itself is the trust boundary).
cat > "$OUT" <<EOF
{
  "TCP": {
    "443": { "HTTPS": true }
  },
  "Web": {
    "${TS_HOSTNAME}.${TAILNET}:443": {
      "Handlers": {
        "/": { "Proxy": "http://bookeeper-neo-server:7843" }
      }
    }
  }
}
EOF

echo "wrote $OUT"
