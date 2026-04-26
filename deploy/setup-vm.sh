#!/bin/bash
set -euo pipefail

# ─── SRS App VM Setup Script ───
# Run on: greg-w-vm (20.242.97.67) Ubuntu 24.04 ARM64
# Assumes: Node.js already installed (for claude-relay), Nginx + certbot already set up for relay
#
# Usage: sudo bash setup-vm.sh

APP_DIR="/opt/srs-app"
DB_NAME="srsapp"
DB_USER="srsapp"
REPO_URL="https://github.com/esper6/srs-reinforcement-app.git"
BRANCH="master"

echo "=== Phase 1: PostgreSQL ==="

if ! command -v psql &>/dev/null; then
    echo "Installing PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
else
    echo "PostgreSQL already installed"
fi

systemctl enable postgresql
systemctl start postgresql

# Create DB user and database (idempotent)
echo "Setting up database..."
DB_PASS=$(openssl rand -hex 24)

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo ""
echo ">>> DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo ">>> Save this! You'll need it for .env.production"
echo ""

echo "=== Phase 2: Clone & Build App ==="

if [ ! -d "$APP_DIR" ]; then
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
    echo "App directory exists, pulling latest..."
    cd "$APP_DIR"
    git pull origin "$BRANCH"
fi

cd "$APP_DIR"

# Ensure correct Node.js version (need 20+)
NODE_VER=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 20 ]; then
    echo "ERROR: Node.js 20+ required, found $(node -v)"
    echo "Install via: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

echo "Node.js $(node -v) OK"

# Create .env.production if it doesn't exist
if [ ! -f "$APP_DIR/.env.production" ]; then
    echo ""
    echo ">>> No .env.production found. Copy deploy/.env.production.template and fill in values."
    echo ">>> Then re-run this script."
    echo ""
    exit 1
fi

npm ci --omit=dev
npx prisma generate
npm run build

# Set ownership for the app user
chown -R www-data:www-data "$APP_DIR"

echo "=== Phase 3: Systemd Service ==="

cp "$APP_DIR/deploy/srs-app.service" /etc/systemd/system/srs-app.service
systemctl daemon-reload
systemctl enable srs-app
systemctl restart srs-app

echo "Waiting for app to start..."
sleep 3
systemctl status srs-app --no-pager

echo "=== Phase 4: Nginx ==="

cp "$APP_DIR/deploy/nginx-memorydump.conf" /etc/nginx/sites-available/memorydump.app
ln -sf /etc/nginx/sites-available/memorydump.app /etc/nginx/sites-enabled/memorydump.app

nginx -t && systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Import your Neon data: pg_restore -U $DB_USER -d $DB_NAME dump.sql"
echo "  2. Run migrations if needed: cd $APP_DIR && DATABASE_URL=... npx prisma migrate deploy"
echo "  3. Set up SSL: certbot --nginx -d memorydump.app"
echo "  4. Update Cloudflare DNS: memorydump.app A record → 20.242.97.67"
echo "  5. Update Google OAuth redirect URIs to https://memorydump.app"
echo ""
