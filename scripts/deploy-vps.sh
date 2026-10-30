#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --env-file "${PROJECT_ROOT}/.env.vps" -f "${PROJECT_ROOT}/docker-compose.vps.yml")
"${compose[@]}" config --quiet
# Build separately to keep peak memory manageable on a small VPS.
for service in dictionary-service backend frontend; do
  "${compose[@]}" build "${service}"
done
"${compose[@]}" up -d --wait --wait-timeout 240
"${compose[@]}" exec -T nginx nginx -t
"${compose[@]}" exec -T nginx nginx -s reload
"${compose[@]}" ps
