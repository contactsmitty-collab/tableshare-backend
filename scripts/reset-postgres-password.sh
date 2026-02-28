#!/bin/bash
# Reset the Postgres 'postgres' user password to 'postgres' so DATABASE_URL in .env.local works.
# Run from tableshare-backend:  bash scripts/reset-postgres-password.sh

set -e

NEW_PASSWORD="${1:-postgres}"
USER="${USER:-$(id -un)}"

echo "Resetting password for Postgres user 'postgres' to '$NEW_PASSWORD'."
echo "Using OS user: $USER"
echo ""

# Option A: Socket connection (no -h) often uses peer auth and needs no password
if psql -U "$USER" -d postgres -c "ALTER USER postgres WITH PASSWORD '$NEW_PASSWORD';" 2>/dev/null; then
  echo "✅ Password updated. Use in .env.local:"
  echo "   DATABASE_URL=postgresql://postgres:$NEW_PASSWORD@localhost:5432/tableshare_dev"
  exit 0
fi

# Option B: Try with -h localhost as postgres (might work if trust is already on)
if psql -h localhost -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '$NEW_PASSWORD';" 2>/dev/null; then
  echo "✅ Password updated. Use in .env.local:"
  echo "   DATABASE_URL=postgresql://postgres:$NEW_PASSWORD@localhost:5432/tableshare_dev"
  exit 0
fi

echo "❌ Could not connect. Do this manually:"
echo ""
echo "1. Find pg_hba.conf:"
echo "   Postgres.app: ~/Library/Application Support/Postgres/var-*/pg_hba.conf"
echo "   Homebrew:     \$(brew --prefix)/var/postgresql@*/pg_hba.conf"
echo ""
echo "2. Change the 'host ... scram-sha-256' lines for 127.0.0.1 and ::1 to use 'trust' instead."
echo ""
echo "3. Restart Postgres (Postgres.app menu, or: brew services restart postgresql@14)"
echo ""
echo "4. Run:"
echo "   psql -h localhost -U postgres -d postgres -c \"ALTER USER postgres WITH PASSWORD '$NEW_PASSWORD';\""
echo ""
echo "5. Change pg_hba.conf back to scram-sha-256 and restart Postgres again."
echo ""
echo "See docs/DATABASE-CONNECTION-TROUBLESHOOTING.md for full steps."
