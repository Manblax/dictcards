#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${PROJECT_ROOT}/.env.production}"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Production environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

compose=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

compose_environment="$("${compose[@]}" config --environment)"

compose_value() {
  local variable_name="$1"

  printf '%s\n' "${compose_environment}" |
    sed -n "s/^${variable_name}=//p" |
    tail -n 1
}

required_variables=(
  FRONTEND_HOST
  API_HOST
  NEXT_PUBLIC_API_URL
  IMAGE_TAG
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  DATABASE_URL
  JWT_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  YANDEX_CLIENT_ID
  YANDEX_CLIENT_SECRET
  INTERNAL_API_URL
  DICTIONARY_SERVICE_URL
)

for variable_name in "${required_variables[@]}"; do
  variable_value="$(compose_value "${variable_name}")"
  if [[ -z "${variable_value}" ]]; then
    echo "Required production variable is empty: ${variable_name}" >&2
    exit 1
  fi
  printf -v "${variable_name}" '%s' "${variable_value}"
done

for secret_name in POSTGRES_PASSWORD JWT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET YANDEX_CLIENT_ID YANDEX_CLIENT_SECRET; do
  if [[ "${!secret_name}" == replace-with-* ]]; then
    echo "Replace the example value for ${secret_name} before deployment." >&2
    exit 1
  fi
done

for domain_variable in FRONTEND_HOST API_HOST; do
  domain_name="${!domain_variable}"
  if (( ${#domain_name} > 253 )) ||
    [[ ! "${domain_name}" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]; then
    echo "${domain_variable} must contain a valid DNS name without a scheme or path." >&2
    exit 1
  fi
done

if [[ "${FRONTEND_HOST}" == "${API_HOST}" ]]; then
  echo "FRONTEND_HOST and API_HOST must be different." >&2
  exit 1
fi

if [[ "${NEXT_PUBLIC_API_URL}" != "https://${API_HOST}" ]]; then
  echo "NEXT_PUBLIC_API_URL must equal https://${API_HOST}." >&2
  exit 1
fi

if [[ "${INTERNAL_API_URL}" != "http://backend:3001" ]]; then
  echo "INTERNAL_API_URL must equal http://backend:3001." >&2
  exit 1
fi

if [[ "${DICTIONARY_SERVICE_URL}" != "http://dictionary-service:4000" ]]; then
  echo "DICTIONARY_SERVICE_URL must equal http://dictionary-service:4000." >&2
  exit 1
fi

if [[ ! "${IMAGE_TAG}" =~ ^sha-[0-9a-f]{7,64}$ ]]; then
  echo "IMAGE_TAG must be an immutable sha-* tag published by CD." >&2
  exit 1
fi

client_max_body_size="$(compose_value CLIENT_MAX_BODY_SIZE)"
if [[ ! "${client_max_body_size}" =~ ^[1-9][0-9]*[kKmMgG]?$ ]]; then
  echo "CLIENT_MAX_BODY_SIZE must be a positive Nginx size, for example 10m." >&2
  exit 1
fi

"${compose[@]}" config --quiet

if [[ "${2:-}" == "--validate-only" ]]; then
  exit 0
fi

"${compose[@]}" pull

frontend_image="ghcr.io/manblax/flashcards2-frontend:${IMAGE_TAG}"
built_api_url="$(
  docker image inspect "${frontend_image}" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^NEXT_PUBLIC_API_URL=//p' |
    tail -n 1
)"

if [[ "${built_api_url}" != "${NEXT_PUBLIC_API_URL}" ]]; then
  echo "Frontend image was built for ${built_api_url:-an unknown API URL}, not ${NEXT_PUBLIC_API_URL}." >&2
  echo "Set the GitHub NEXT_PUBLIC_API_URL variable and publish a new image." >&2
  exit 1
fi

"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps
