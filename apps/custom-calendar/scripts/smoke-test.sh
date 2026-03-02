#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

API_BASE="${API_BASE:-http://localhost:10000}"
PASS="${SMOKE_PASSWORD:-smoke-pass-1234}"
EMAIL="${SMOKE_EMAIL:-smoke.$(date +%s)@example.com}"
NAME="${SMOKE_NAME:-Smoke User}"
FAMILY_NAME="${SMOKE_FAMILY_NAME:-Smoke Family}"
EVENT_TITLE="${SMOKE_EVENT_TITLE:-Smoke Event}"

echo "Running smoke test against: ${API_BASE}"

health_json="$(curl -fsS "${API_BASE}/health")"
health_ok="$(echo "${health_json}" | jq -r '.ok')"
if [[ "${health_ok}" != "true" ]]; then
  echo "Health check failed: ${health_json}"
  exit 1
fi
echo "Health OK"

register_json="$(curl -fsS -X POST "${API_BASE}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"name\":\"${NAME}\",\"password\":\"${PASS}\"}")"

token="$(echo "${register_json}" | jq -r '.token')"
if [[ -z "${token}" || "${token}" == "null" ]]; then
  echo "Register failed: ${register_json}"
  exit 1
fi
echo "Register OK (${EMAIL})"

family_json="$(curl -fsS -X POST "${API_BASE}/families" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${token}" \
  -d "{\"name\":\"${FAMILY_NAME}\"}")"

family_id="$(echo "${family_json}" | jq -r '.family.id')"
if [[ -z "${family_id}" || "${family_id}" == "null" ]]; then
  echo "Create family failed: ${family_json}"
  exit 1
fi
echo "Family OK (id=${family_id})"

start_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
  end_at="$(date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")"
else
  end_at="$(date -u -d '+1 hour' +"%Y-%m-%dT%H:%M:%SZ")"
fi

event_json="$(curl -fsS -X POST "${API_BASE}/families/${family_id}/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${token}" \
  -d "{\"title\":\"${EVENT_TITLE}\",\"notes\":\"Smoke\",\"startAt\":\"${start_at}\",\"endAt\":\"${end_at}\",\"allDay\":false}")"

event_id="$(echo "${event_json}" | jq -r '.event.id')"
if [[ -z "${event_id}" || "${event_id}" == "null" ]]; then
  echo "Create event failed: ${event_json}"
  exit 1
fi
echo "Event OK (id=${event_id})"

month_from="$(date -u +"%Y-%m-01T00:00:00.000Z")"
if date -u -v+1m +"%Y-%m-01T00:00:00.000Z" >/dev/null 2>&1; then
  month_to="$(date -u -v+1m +"%Y-%m-01T00:00:00.000Z")"
else
  month_to="$(date -u -d "$(date +%Y-%m-01) +1 month" +"%Y-%m-01T00:00:00.000Z")"
fi

events_json="$(curl -fsS "${API_BASE}/families/${family_id}/events?from=${month_from}&to=${month_to}" \
  -H "Authorization: Bearer ${token}")"

events_count="$(echo "${events_json}" | jq '.events | length')"
if [[ "${events_count}" -lt 1 ]]; then
  echo "List events failed: ${events_json}"
  exit 1
fi

echo "Smoke test passed"
echo "Summary: user=${EMAIL}, family_id=${family_id}, event_id=${event_id}, events_count=${events_count}"
