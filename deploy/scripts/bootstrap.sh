#!/usr/bin/env bash
# bootstrap.sh — first-time provisioning of the Hetzner CPX32 host that
# will run the Bookeeper Neo stack ALONGSIDE other Docker workloads.
#
# Idempotent: safe to re-run. Each step is guarded; nothing is reapplied
# if it is already in place. NEVER touches your existing Docker containers,
# networks, or volumes.
#
# Usage (as root, on the Hetzner VM):
#   curl -fsSL https://raw.githubusercontent.com/Bardugo624/Bookeeper-Neo/main/deploy/scripts/bootstrap.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   sudo ./bootstrap.sh
#
# What it does:
#   1. Verifies it is running as root on a supported distro.
#   2. Sets timezone & locale.
#   3. Updates the OS and enables unattended security upgrades.
#   4. Installs Docker (if missing) without disturbing existing containers.
#   5. Installs fail2ban.
#   6. Hardens SSH: disables password auth, root password login.
#   7. Configures UFW firewall (compatible with Hetzner Cloud Firewall).
#   8. Creates the install directory at /opt/bookeeper-neo.
#   9. Prints the next steps (clone repo + configure .env).
#
# What it does NOT do:
#   - Touch any pre-existing /etc/docker/daemon.json beyond a backup.
#   - Stop, restart, or list other Docker containers.
#   - Open Bookeeper-specific ports in UFW (those are decided in .env).
#
# Exit codes:
#   0  success
#   2  unsupported OS
#   3  not root
#   4  Docker installation failed

set -Eeuo pipefail

readonly SCRIPT_VERSION="1.0.0"
readonly INSTALL_DIR="/opt/bookeeper-neo"
readonly REPO_URL="https://github.com/Bardugo624/Bookeeper-Neo.git"

readonly C_BLUE=$'\033[1;34m'
readonly C_GREEN=$'\033[1;32m'
readonly C_YELLOW=$'\033[1;33m'
readonly C_RED=$'\033[1;31m'
readonly C_RESET=$'\033[0m'

log()  { printf '%s[bootstrap]%s %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n'      "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n'      "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s[err ]%s %s\n'      "$C_RED"    "$C_RESET" "$*" >&2; }

trap 'err "failed at line $LINENO (exit $?)"; exit 1' ERR

require_root() {
    if [[ $EUID -ne 0 ]]; then
        err "must run as root (use: sudo $0)"
        exit 3
    fi
}

detect_distro() {
    if [[ ! -r /etc/os-release ]]; then
        err "/etc/os-release missing — cannot detect distro"
        exit 2
    fi
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
        debian|ubuntu) ok "detected ${PRETTY_NAME:-$ID}" ;;
        *) err "unsupported distro '$ID' (need debian or ubuntu)"; exit 2 ;;
    esac
}

set_timezone() {
    local target_tz="${TZ:-Europe/Rome}"
    local current_tz
    current_tz=$(timedatectl show -p Timezone --value 2>/dev/null || echo "")
    if [[ "$current_tz" == "$target_tz" ]]; then
        ok "timezone already $target_tz"
    else
        log "setting timezone → $target_tz"
        timedatectl set-timezone "$target_tz"
        ok "timezone set to $target_tz"
    fi
}

apt_update_upgrade() {
    log "apt update + full-upgrade (security patches included)"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get -y -qq -o Dpkg::Options::="--force-confdef" \
                   -o Dpkg::Options::="--force-confold" full-upgrade
    apt-get -y -qq autoremove
    ok "OS up to date"
}

install_unattended_upgrades() {
    if dpkg -s unattended-upgrades >/dev/null 2>&1; then
        ok "unattended-upgrades already installed"
    else
        log "installing unattended-upgrades"
        apt-get install -y -qq unattended-upgrades apt-listchanges
    fi
    # Enable auto upgrades non-interactively.
    cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
    ok "automatic security upgrades enabled"
}

install_docker() {
    if command -v docker >/dev/null 2>&1; then
        local ver
        ver=$(docker --version | awk '{print $3}' | tr -d ',')
        ok "Docker already installed ($ver) — leaving existing setup intact"
        # Sanity check that docker is functional, but do NOT restart it
        # (would interrupt your other containers).
        if ! docker info >/dev/null 2>&1; then
            err "Docker is installed but not responding (docker info failed)"
            exit 4
        fi
        return
    fi
    log "installing Docker via official convenience script"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh >/dev/null
    rm -f /tmp/get-docker.sh
    systemctl enable --now docker
    ok "Docker installed: $(docker --version)"
}

install_fail2ban() {
    if dpkg -s fail2ban >/dev/null 2>&1; then
        ok "fail2ban already installed"
        return
    fi
    log "installing fail2ban"
    apt-get install -y -qq fail2ban
    cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled  = true
port     = ssh
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
    systemctl enable --now fail2ban
    ok "fail2ban active for sshd"
}

install_authorized_keys() {
    # Idempotent installer: merges any new key from
    # deploy/scripts/authorized_keys into /root/.ssh/authorized_keys
    # without removing keys that may have been added out-of-band.
    local src
    src="$(dirname "$(readlink -f "$0")")/authorized_keys"
    if [[ ! -f "$src" ]]; then
        warn "no authorized_keys file at $src — skipping key install"
        return
    fi
    install -d -m 0700 /root/.ssh
    touch /root/.ssh/authorized_keys
    chmod 0600 /root/.ssh/authorized_keys
    chown -R root:root /root/.ssh

    local added=0
    while IFS= read -r line; do
        # Skip blanks and comments.
        [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
        # ssh-keygen verifies that the line is a well-formed pubkey before
        # we trust it; bail out if any line is malformed.
        if ! printf '%s\n' "$line" | ssh-keygen -lf - >/dev/null 2>&1; then
            err "malformed pubkey in $src: $line"
            exit 1
        fi
        if grep -qxF "$line" /root/.ssh/authorized_keys; then
            continue
        fi
        printf '%s\n' "$line" >> /root/.ssh/authorized_keys
        added=$((added + 1))
        local fp
        fp=$(printf '%s\n' "$line" | ssh-keygen -lf - | awk '{print $2}')
        ok "added pubkey $fp"
    done < "$src"

    if (( added == 0 )); then
        ok "authorized_keys already up to date"
    else
        ok "$added new pubkey(s) installed for root"
    fi
}

harden_ssh() {
    local sshd_drop=/etc/ssh/sshd_config.d/99-bookeeper-hardening.conf
    if [[ -f "$sshd_drop" ]]; then
        ok "SSH hardening already applied ($sshd_drop)"
        return
    fi
    # Refuse to lock out the operator: ensure root has at least one
    # authorized key before disabling password auth.
    if [[ ! -s /root/.ssh/authorized_keys ]]; then
        warn "/root/.ssh/authorized_keys is empty — SSH password auth will"
        warn "NOT be disabled. Add your public key to that file and re-run"
        warn "this script to complete hardening."
        return
    fi
    log "hardening SSH (writing $sshd_drop)"
    cat >"$sshd_drop" <<'EOF'
# Bookeeper Neo bootstrap — SSH hardening
PasswordAuthentication no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    if sshd -t; then
        systemctl reload ssh 2>/dev/null || systemctl reload sshd
        ok "sshd reloaded with hardened config"
    else
        err "sshd config test failed — restoring previous state"
        rm -f "$sshd_drop"
        exit 1
    fi
}

configure_ufw() {
    if ! command -v ufw >/dev/null 2>&1; then
        log "installing ufw"
        apt-get install -y -qq ufw
    fi
    # UFW + Docker can conflict (Docker bypasses iptables). We set UFW to
    # default-deny inbound for HOST services, leaving Docker's published
    # ports controlled by the per-stack `HOST_BIND_IP` we use in compose.
    if ufw status | grep -q "Status: active"; then
        ok "ufw already active"
    else
        log "configuring ufw (defaults: deny inbound, allow outbound)"
        ufw --force reset >/dev/null
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow OpenSSH
        # Tailscale uses UDP 41641 for direct connections (NAT traversal).
        ufw allow 41641/udp comment 'tailscale'
        ufw --force enable
        ok "ufw enabled (SSH + Tailscale UDP allowed)"
    fi
    warn "Bookeeper public ports (80/443 or 8443/8080) are NOT opened by"
    warn "this script — open them in Hetzner Cloud Firewall AFTER you have"
    warn "decided your coexistence strategy (see deploy/hetzner/SETUP.md §1)."
}

prepare_install_dir() {
    mkdir -p "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    ok "install dir ready: $INSTALL_DIR"
}

print_next_steps() {
    cat <<EOF

${C_GREEN}════════════════════════════════════════════════════════════════${C_RESET}
${C_GREEN}  Bootstrap completed (script v$SCRIPT_VERSION).${C_RESET}
${C_GREEN}════════════════════════════════════════════════════════════════${C_RESET}

Next steps:

  1. Clone the repo into the install directory:
       cd $INSTALL_DIR
       git clone $REPO_URL .

  2. Configure environment:
       cd deploy
       cp .env.example .env
       \$EDITOR .env       # fill TS_AUTHKEY, TAILNET, HOST_BIND_IP, ...

  3. Run the pre-flight audit (verifies no collision with existing stacks):
       sudo ./scripts/preflight.sh

  4. Bring the stack up:
       docker compose up -d
       docker compose logs -f

  5. Future updates (idempotent):
       sudo $INSTALL_DIR/deploy/scripts/update.sh

EOF
}

main() {
    require_root
    detect_distro
    set_timezone
    apt_update_upgrade
    install_unattended_upgrades
    install_docker
    install_fail2ban
    install_authorized_keys
    harden_ssh
    configure_ufw
    prepare_install_dir
    print_next_steps
}

main "$@"
