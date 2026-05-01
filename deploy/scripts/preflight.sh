#!/usr/bin/env bash
# preflight.sh — verifies that the host can run the Bookeeper Neo stack
# without colliding with any pre-existing Docker workload.
#
# Idempotent and read-only. Exits non-zero if a collision is detected.
#
# Usage (in the deploy/ directory, after editing .env):
#   sudo ./scripts/preflight.sh
#
# Checks performed:
#   1. .env exists and required vars are set.
#   2. The chosen BOOKEEPER_SUBNET does not overlap any existing Docker
#      network subnet.
#   3. No container named `bookeeper-neo-*` already exists.
#   4. No volume / network with the bookeeper-neo prefix already exists
#      (would be reused unexpectedly).
#   5. The host port chosen by HOST_BIND_IP:PUBLIC_HTTPS_PORT (and ACME
#      port) is not currently bound by another listener.
#   6. /dev/net/tun exists (required by the Tailscale container).
#   7. Docker daemon is responsive.

set -Eeuo pipefail

readonly C_GREEN=$'\033[1;32m'
readonly C_YELLOW=$'\033[1;33m'
readonly C_RED=$'\033[1;31m'
readonly C_BLUE=$'\033[1;34m'
readonly C_RESET=$'\033[0m'

log()  { printf '%s[preflight]%s %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n'      "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n'      "$C_YELLOW" "$C_RESET" "$*" >&2; }
fail() { printf '%s[FAIL]%s %s\n'      "$C_RED"    "$C_RESET" "$*" >&2; FAILED=1; }

FAILED=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"

# 1. .env file & required vars -------------------------------------------------
check_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        fail ".env not found at $ENV_FILE — copy .env.example and edit it"
        return
    fi
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a

    local missing=0
    for v in SERVER_HOST ACME_EMAIL TS_AUTHKEY TAILNET TS_HOSTNAME \
             HOST_BIND_IP PUBLIC_HTTPS_PORT ACME_HTTP_PORT BOOKEEPER_SUBNET; do
        if [[ -z "${!v:-}" ]]; then
            fail "required env var unset: $v"
            missing=1
        fi
    done
    if [[ "${TS_AUTHKEY:-}" == "tskey-auth-REPLACE_ME" ]]; then
        fail "TS_AUTHKEY is still the placeholder — generate a real one"
    fi
    [[ $missing -eq 0 ]] && ok ".env loaded with all required vars"
}

# 2. Subnet collision ----------------------------------------------------------
check_subnet() {
    local target="${BOOKEEPER_SUBNET:-172.31.7.0/24}"
    log "checking subnet $target against existing Docker networks"
    local conflicting
    conflicting=$(docker network ls -q | xargs -r -I {} docker network inspect {} \
        --format '{{.Name}}|{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null \
        | awk -F'|' -v target="$target" '
            $2 ~ target { print $1; found=1 }
            END { if (!found) exit 0 }
        ' | grep -v '^bookeeper-neo-net$' || true)
    if [[ -n "$conflicting" ]]; then
        fail "subnet $target overlaps with networks: $conflicting"
        fail "→ change BOOKEEPER_SUBNET in .env to a free /24"
    else
        ok "subnet $target is free"
    fi
}

# 3. Container name collision --------------------------------------------------
check_container_names() {
    local clashes
    clashes=$(docker ps -a --format '{{.Names}}' | grep '^bookeeper-neo-' || true)
    if [[ -n "$clashes" ]]; then
        warn "containers already exist:"
        printf '       %s\n' $clashes
        warn "→ this is fine if you are reinstalling; otherwise stop them first"
    else
        ok "no pre-existing bookeeper-neo-* containers"
    fi
}

# 4. Volume name collision -----------------------------------------------------
check_volumes() {
    local clashes
    clashes=$(docker volume ls --format '{{.Name}}' | grep '^bookeeper-neo-' || true)
    if [[ -n "$clashes" ]]; then
        warn "volumes already exist (data will be reused):"
        printf '       %s\n' $clashes
    else
        ok "no pre-existing bookeeper-neo-* volumes"
    fi
}

# 5. Host port availability ----------------------------------------------------
check_ports() {
    local bind="${HOST_BIND_IP}"
    for port in "$PUBLIC_HTTPS_PORT" "$ACME_HTTP_PORT"; do
        # ss is more reliable than lsof here; -H suppresses header.
        local in_use
        in_use=$(ss -Hltn "sport = :$port" 2>/dev/null | awk '{print $4}' || true)
        if [[ -z "$in_use" ]]; then
            ok "host port $port is free"
            continue
        fi
        # Acceptable: bound on a different IP than ours.
        local conflict=0
        while IFS= read -r addr; do
            local listen_ip="${addr%:*}"
            # 0.0.0.0 / [::] / * mean "all interfaces" → always conflicts
            case "$listen_ip" in
                0.0.0.0|"*"|"[::]"|"") conflict=1 ;;
                "$bind")               conflict=1 ;;
            esac
        done <<<"$in_use"
        if (( conflict )); then
            fail "port $port already bound (would collide with HOST_BIND_IP=$bind):"
            printf '       %s\n' $in_use
            fail "→ pick a different PUBLIC_HTTPS_PORT/ACME_HTTP_PORT or HOST_BIND_IP"
        else
            ok "port $port bound elsewhere ($in_use) — no collision with $bind"
        fi
    done
}

# 6. /dev/net/tun --------------------------------------------------------------
check_tun() {
    if [[ -c /dev/net/tun ]]; then
        ok "/dev/net/tun present (Tailscale kernel mode available)"
    else
        warn "/dev/net/tun missing — set TS_USERSPACE=true in compose"
    fi
}

# 7. Docker daemon -------------------------------------------------------------
check_docker() {
    if docker info >/dev/null 2>&1; then
        ok "Docker daemon responsive"
    else
        fail "Docker daemon not responding (run: systemctl status docker)"
    fi
}

main() {
    check_docker
    check_env
    check_container_names
    check_volumes
    check_subnet
    check_ports
    check_tun

    echo
    if (( FAILED )); then
        fail "preflight FAILED — fix the issues above before running 'docker compose up'"
        exit 1
    fi
    ok "preflight passed — ready to deploy"
}

main "$@"
