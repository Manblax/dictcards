#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --env-file "${PROJECT_ROOT}/.env.vps" -f "${PROJECT_ROOT}/docker-compose.vps.yml")
"${compose[@]}" run --rm --no-deps certbot renew --quiet "$@"
"${compose[@]}" exec -T nginx nginx -t
"${compose[@]}" exec -T nginx nginx -s reload
