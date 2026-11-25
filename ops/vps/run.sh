#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml.
# Current content: stop the projectzomboid container and keep it stopped.
# The container, its image and its data are left in place.
set -eu

c=projectzomboid
echo "== before"
docker inspect -f '{{.State.Status}} restart={{.HostConfig.RestartPolicy.Name}}' "$c"
docker update --restart=no "$c" >/dev/null
docker stop --time 120 "$c" >/dev/null
echo "== after"
docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}} restart={{.HostConfig.RestartPolicy.Name}}' "$c"
docker ps --format '{{.Names}}\t{{.Status}}'
free -m
