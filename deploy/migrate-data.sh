#!/bin/bash
set -euo pipefail

# ─── Data Migration: Neon → Local Postgres ───
# Run this ON THE VM after Postgres is set up.
#
# Usage: bash migrate-data.sh <neon_connection_string> <local_db_url>
# Example: bash migrate-data.sh "postgresql://neondb_owner:npg_xxx@ep-xxx.neon.tech/neondb?sslmode=require" "postgresql://srsapp:xxx@localhost:5432/srsapp"

NEON_URL="${1:?Usage: migrate-data.sh <neon_url> <local_db_url>}"
LOCAL_URL="${2:?Usage: migrate-data.sh <neon_url> <local_db_url>}"

DUMP_FILE="/tmp/neon-dump-$(date +%Y%m%d-%H%M%S).sql"

echo "=== Step 1: Dumping from Neon ==="
echo "This may take a moment depending on data size..."

# --no-owner: don't set ownership (we'll use local user)
# --no-acl: skip access privileges
# --clean: drop objects before creating (safe for fresh DB)
# Remove channel_binding param if present (pg_dump may not support it)
CLEAN_NEON_URL=$(echo "$NEON_URL" | sed 's/&channel_binding=[^&]*//' | sed 's/?channel_binding=[^&]*//')

pg_dump "$CLEAN_NEON_URL" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --format=plain \
    > "$DUMP_FILE"

echo "Dump saved to $DUMP_FILE ($(wc -c < "$DUMP_FILE") bytes)"

echo ""
echo "=== Step 2: Restoring to local Postgres ==="

psql "$LOCAL_URL" < "$DUMP_FILE"

echo ""
echo "=== Step 3: Verify ==="

echo "Table row counts:"
psql "$LOCAL_URL" -c "
SELECT schemaname, relname AS table, n_live_tup AS rows
FROM pg_stat_user_tables
ORDER BY relname;
"

echo ""
echo "=== Migration complete ==="
echo "Dump file kept at: $DUMP_FILE"
