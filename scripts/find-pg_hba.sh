#!/bin/bash
# Find pg_hba.conf so you can switch to 'trust' and reset the postgres password.
# Run: bash scripts/find-pg_hba.sh

echo "Looking for pg_hba.conf..."
echo ""

FOUND=$(find "$HOME/Library/Application Support/Postgres" /opt/homebrew/var /usr/local/var -name "pg_hba.conf" 2>/dev/null | head -1)

if [ -z "$FOUND" ]; then
  echo "Could not find pg_hba.conf. Check:"
  echo "  Postgres.app: ~/Library/Application Support/Postgres/var-*/"
  echo "  Homebrew:     ls \$(brew --prefix)/var/postgres*/pg_hba.conf"
  exit 1
fi

echo "Found: $FOUND"
echo ""
echo "1. Open it:  open -e \"$FOUND\"   (or: nano \"$FOUND\")"
echo "2. Change the two lines that end with  scram-sha-256  to end with  trust"
echo "   (the lines with 127.0.0.1/32 and ::1/128)"
echo "3. Restart Postgres (Postgres.app menu or: brew services restart postgresql@14)"
echo "4. Run:  psql -h localhost -U postgres -d postgres -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
echo "5. Change trust back to scram-sha-256 in pg_hba.conf and restart Postgres again."
echo ""
echo "Full steps: scripts/RESET-POSTGRES-PASSWORD.md"
