#!/bin/bash
set -euo pipefail

# ─── One-time setup for the dev environment ───
# Run on the VM: sudo bash deploy/setup-dev.sh

APP_DIR="/opt/srs-app-dev"
DB_NAME="srsapp_dev"
DB_USER="srsapp"

echo "=== Create dev database ==="

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "=== Clone dev instance ==="

if [ ! -d "$APP_DIR" ]; then
    git clone --branch develop https://github.com/esper6/srs-reinforcement-app.git "$APP_DIR"
else
    echo "Dev directory exists, pulling latest..."
    cd "$APP_DIR"
    git pull origin develop
fi

echo ""
echo ">>> Now create $APP_DIR/.env.production"
echo ">>> Copy from /opt/srs-app/.env.production and change:"
echo ">>>   DATABASE_URL → use $DB_NAME instead of srsapp"
echo ">>>   NEXTAUTH_URL → https://dev.memorydump.app"
echo ""
echo ">>> Then symlink: ln -s $APP_DIR/.env.production $APP_DIR/.env"
echo ""
echo ">>> Then run:"
echo ">>>   cd $APP_DIR && npm ci && npx prisma generate && npm run build"
echo ">>>   sudo cp $APP_DIR/deploy/srs-app-dev.service /etc/systemd/system/"
echo ">>>   sudo systemctl daemon-reload && sudo systemctl enable srs-app-dev && sudo systemctl start srs-app-dev"
echo ">>>   sudo cp $APP_DIR/deploy/nginx-dev-memorydump.conf /etc/nginx/sites-available/dev.memorydump.app"
echo ">>>   sudo ln -s /etc/nginx/sites-available/dev.memorydump.app /etc/nginx/sites-enabled/"
echo ">>>   sudo nginx -t && sudo systemctl reload nginx"
echo ">>>   sudo certbot --nginx -d dev.memorydump.app"
echo ""
