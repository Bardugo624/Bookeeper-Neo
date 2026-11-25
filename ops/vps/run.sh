#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml.
# Current content: read-only status. It changes nothing.
set -u
docker ps -a --format '{{.Names}}\t{{.Status}}'
free -m
