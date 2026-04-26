#!/bin/bash
set -euo pipefail

APP_DIR="/opt/srs-app"
BRANCH="master"
SERVICE="srs-app"
PORT="3000"
HEALTH_URL="http://localhost:${PORT}/api/health"
HEALTH_TIMEOUT_SEC=60

echo "=== Deploying prod ($BRANCH) ==="

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npx prisma generate

# Order matters: build BEFORE migrate. A failing build with a successful
# migration leaves the running service hitting a new schema with old code.
# Failing here is recoverable — schema is untouched.
npm run build

npx prisma migrate deploy

sudo systemctl restart "$SERVICE"

# Poll /api/health until the new process is actually serving traffic.
# systemctl restart returns 0 the moment the unit is requested, not when the
# Node process is up — without this the deploy script would happily declare
# success while the service crashes in a startup loop.
echo "Waiting up to ${HEALTH_TIMEOUT_SEC}s for ${HEALTH_URL} ..."
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SEC ))
while true; do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ Healthy"
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "✗ Service did not become healthy within ${HEALTH_TIMEOUT_SEC}s"
    echo "  Last 50 lines of journal:"
    sudo journalctl -u "$SERVICE" -n 50 --no-pager || true
    exit 1
  fi
  sleep 2
done

echo "=== Prod deploy complete ==="
