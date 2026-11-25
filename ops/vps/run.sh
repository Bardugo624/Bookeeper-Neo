#!/usr/bin/env bash
# Executed on the VPS by .github/workflows/vps-ops.yml.
# Current content: read-only memory survey. It changes nothing.
set -u

echo "== memory"
free -m
echo "== containers (all)"
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
echo "== container memory"
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}'
echo "== top processes by resident memory"
ps -eo rss,pid,user,comm --sort=-rss | head -15 | awk 'NR==1{print;next}{printf "%d MB\t%s\t%s\t%s\n",$1/1024,$2,$3,$4}'
echo "== swap and pressure"
swapon --show 2>/dev/null || true
cat /proc/pressure/memory 2>/dev/null || true
