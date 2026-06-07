#!/bin/bash
# Snapshot the local outreach Postgres DB to backend/backups/.
# Usage: npm run db:backup   (or ./scripts/backup-db.sh)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/backups"

TS=$(date +%Y%m%d-%H%M%S)
FILE="$DIR/backups/outreach-${TS}.dump"

pg_dump -h localhost -U "${PGUSER:-$(whoami)}" -d outreach -F c -f "$FILE"
echo "Backup written to $FILE"

# Keep the last 14 snapshots, prune older ones
ls -1t "$DIR"/backups/outreach-*.dump 2>/dev/null | tail -n +15 | xargs -r rm --
