#!/bin/bash
set -euo pipefail

APP_DIR="/opt/srs-app"
BRANCH="master"

echo "=== Deploying prod ($BRANCH) ==="

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

sudo systemctl restart srs-app

echo "=== Prod deploy complete ==="
