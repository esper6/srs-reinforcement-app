#!/bin/bash
set -euo pipefail

APP_DIR="/opt/srs-app-dev"
BRANCH="develop"
SERVICE="srs-app-dev"
PORT="3001"
HEALTH_URL="http://localhost:${PORT}/api/health"
HEALTH_TIMEOUT_SEC=60

echo "=== Deploying dev ($BRANCH) ==="

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npx prisma generate

# Order matters: build BEFORE migrate. A failing build with a successful
# migration leaves the running service hitting a new schema with old code,
# which is what bit Phase 6. Failing here is recoverable — schema is untouched.
# APP_ENV=development drives the [DEV] tab title and ribbon for any pages
# Next prerenders at build time (runtime systemd env doesn't reach this step).
APP_ENV=development npm run build

npx prisma migrate deploy

# Sync the systemd unit file from the repo if it changed, so things like
# Environment= edits actually take effect. Without daemon-reload, systemctl
# restart re-launches the service with the *old* unit definition.
UNIT_SRC="$APP_DIR/deploy/${SERVICE}.service"
UNIT_DST="/etc/systemd/system/${SERVICE}.service"
if ! sudo cmp -s "$UNIT_SRC" "$UNIT_DST"; then
  echo "systemd unit changed — syncing $UNIT_DST and reloading daemon"
  sudo cp "$UNIT_SRC" "$UNIT_DST"
  sudo systemctl daemon-reload
fi

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

echo "=== Dev deploy complete ==="
