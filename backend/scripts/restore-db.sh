#!/bin/bash
# Restore the local outreach Postgres DB from a backup snapshot.
# Usage: npm run db:restore -- backups/outreach-20260607-181143.dump
#        (defaults to the most recent snapshot in backend/backups/ if no path given)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:-$(ls -1t "$DIR"/backups/outreach-*.dump 2>/dev/null | head -n 1)}"

if [ -z "$FILE" ]; then
  echo "No backup file found. Pass a path or run npm run db:backup first." >&2
  exit 1
fi

echo "Restoring from $FILE — this OVERWRITES the current outreach database."
read -p "Type 'yes' to continue: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }

dropdb -h localhost -U "${PGUSER:-$(whoami)}" --if-exists outreach
createdb -h localhost -U "${PGUSER:-$(whoami)}" outreach
pg_restore -h localhost -U "${PGUSER:-$(whoami)}" -d outreach "$FILE"
echo "Restore complete."
