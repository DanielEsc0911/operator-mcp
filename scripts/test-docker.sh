#!/usr/bin/env bash
# Boots a disposable OpenProject, seeds it, runs test-live against it, removes it.
set -euo pipefail

IMAGE="openproject/openproject:16.6.10@sha256:eb08fa636184f737af2cd31b2ef1706cb9b35bf7bc2cfe2c4e065e1dd461a74e"
NAME="operator-live-$$"
PORT="${OPENPROJECT_TEST_PORT:-18080}"
HERE="$(cd "$(dirname "$0")" && pwd)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:80" \
  -e OPENPROJECT_SECRET_KEY_BASE=disposable-test-instance-only \
  -e OPENPROJECT_HOST__NAME="localhost:$PORT" \
  -e OPENPROJECT_HTTPS=false \
  -e OPENPROJECT_DEFAULT__LANGUAGE=en \
  "$IMAGE" >/dev/null

echo "waiting for OpenProject (first boot takes a few minutes)..."
for _ in $(seq 1 90); do
  curl -sf "http://localhost:$PORT/health_checks/default" >/dev/null && break
  sleep 5
done
curl -sf "http://localhost:$PORT/health_checks/default" >/dev/null || { docker logs --tail 40 "$NAME" >&2; echo "OpenProject did not become healthy" >&2; exit 1; }

docker cp "$HERE/seed-openproject.rb" "$NAME:/tmp/seed.rb"
KEY="$(docker exec "$NAME" bash -c 'cd /app && bundle exec rails runner /tmp/seed.rb' | sed -n 's/^KEY=//p')"
[ -n "$KEY" ] || { echo "seeding did not produce an API key" >&2; exit 1; }

OPENPROJECT_URL="http://localhost:$PORT" \
OPENPROJECT_API_KEY="$KEY" \
OPENPROJECT_TEST_PROJECT=operator-live \
OPENPROJECT_LIVE_DISPOSABLE=1 \
  npm run test:live
