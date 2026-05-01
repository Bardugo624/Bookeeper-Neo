#!/usr/bin/env bash
# update.sh — idempotent update routine for the Bookeeper Neo stack.
#
# Run periodically (manually or via cron). Safe to interrupt; on the next
# run it will simply re-evaluate state. NEVER touches other Docker
# workloads on this host.
#
# Usage (as root, on the Hetzner VM):
#   sudo /opt/bookeeper-neo/deploy/scripts/update.sh
#
# What it does:
#   1. Pulls latest commits from main.
#   2. Pulls latest images for the bookeeper-neo project ONLY.
#   3. Re-creates only changed services (`docker compose up -d`).
#   4. Prunes dangling images created by this update (project-scoped).
#   5. Verifies that the stack is healthy after the update.
#
# What it does NOT do:
#   - Update the host OS (use unattended-upgrades; bootstrap.sh sets it up).
#   - Run `docker system prune` globally (would touch other stacks).
#   - Restart the Docker daemon.

set -Eeuo pipefail

readonly C_BLUE=$'\033[1;34m'
readonly C_GREEN=$'\033[1;32m'
readonly C_YELLOW=$'\033[1;33m'
readonly C_RED=$'\033[1;31m'
readonly C_RESET=$'\033[0m'

log()  { printf '%s[update]%s %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s[ ok  ]%s %s\n'  "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%s[warn ]%s %s\n'  "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s[err  ]%s %s\n'  "$C_RED"    "$C_RESET" "$*" >&2; }

trap 'err "failed at line $LINENO (exit $?)"; exit 1' ERR

if [[ $EUID -ne 0 ]]; then
    err "must run as root (use: sudo $0)"
    exit 3
fi

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
readonly PROJECT_NAME="bookeeper-neo"

cd "$DEPLOY_DIR"

# 1. Pre-checks ----------------------------------------------------------------
if [[ ! -f .env ]]; then
    err ".env missing in $DEPLOY_DIR — refusing to update without config"
    exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
    err "docker not installed (run bootstrap.sh first)"
    exit 1
fi

# 2. Git pull ------------------------------------------------------------------
log "pulling latest commits in $REPO_DIR"
cd "$REPO_DIR"
local_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$local_branch" != "main" ]]; then
    warn "not on 'main' branch (currently '$local_branch') — skipping git pull"
else
    if git diff --quiet && git diff --cached --quiet; then
        git fetch --quiet origin main
        local_sha=$(git rev-parse HEAD)
        remote_sha=$(git rev-parse origin/main)
        if [[ "$local_sha" == "$remote_sha" ]]; then
            ok "already up to date ($local_sha)"
        else
            log "$local_sha → $remote_sha"
            git merge --ff-only origin/main
            ok "fast-forwarded to $(git rev-parse --short HEAD)"
        fi
    else
        warn "working tree has local changes — skipping git pull"
    fi
fi
cd "$DEPLOY_DIR"

# 3. Pull updated images for this project only --------------------------------
log "pulling images for project '$PROJECT_NAME'"
docker compose --project-name "$PROJECT_NAME" pull --quiet --ignore-buildable
ok "images pulled"

# 3b. Rebuild locally-built images (Go server) --------------------------------
# `compose pull` skips images that have a `build:` context. We must
# rebuild them explicitly so source-code changes pulled at step 2 take
# effect. `--pull` keeps the base images fresh.
log "rebuilding locally-built images"
docker compose --project-name "$PROJECT_NAME" build --pull
ok "images rebuilt"

# 4. Apply changes -------------------------------------------------------------
log "applying changes (docker compose up -d)"
docker compose --project-name "$PROJECT_NAME" up -d --remove-orphans
ok "containers reconciled"

# 5. Project-scoped image prune ------------------------------------------------
# Filtering by label keeps untouched any image used by other stacks.
log "pruning dangling images created by this project"
removed=$(docker image prune -f \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    | awk '/Total reclaimed space/{print}')
[[ -n "$removed" ]] && ok "$removed" || ok "nothing to prune"

# 6. Post-update health check --------------------------------------------------
log "waiting for services to settle (10s)"
sleep 10

ALL_HEALTHY=1
for svc in bookeeper-neo-server bookeeper-neo-caddy bookeeper-neo-tailscale; do
    state=$(docker inspect -f '{{.State.Status}}' "$svc" 2>/dev/null || echo missing)
    if [[ "$state" == "running" ]]; then
        ok "$svc → running"
    else
        err "$svc → $state"
        ALL_HEALTHY=0
    fi
done

# Optional: hit the Caddy admin to confirm it parsed config OK.
if docker exec bookeeper-neo-caddy wget -qO- http://127.0.0.1:2019/config/ \
        >/dev/null 2>&1; then
    ok "Caddy admin reachable"
else
    warn "Caddy admin not reachable — check 'docker compose logs caddy'"
fi

if (( ALL_HEALTHY )); then
    ok "update complete — stack healthy"
else
    err "update finished but some services are not running — investigate"
    exit 1
fi
