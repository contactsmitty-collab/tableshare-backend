# Reset Postgres password when you're locked out

Your Postgres is asking for a password for `christophersmith` and you don't know it. Use **trust** auth temporarily so you can connect without a password and set the `postgres` user's password.

---

## Step 1: Find pg_hba.conf

Run this to search for it:

```bash
find ~/Library/Application\ Support/Postgres /opt/homebrew/var /usr/local/var -name "pg_hba.conf" 2>/dev/null
```

Or check manually:

- **Postgres.app:** Open the Postgres.app menu → **Open config** (or look in `~/Library/Application Support/Postgres/var-15/` or similar).
- **Homebrew:** `ls $(brew --prefix)/var/postgresql@*/pg_hba.conf` or `ls /opt/homebrew/var/postgres@*/pg_hba.conf`

Note the full path (e.g. `/opt/homebrew/var/postgres@14/pg_hba.conf`).

---

## Step 2: Edit pg_hba.conf

Open the file in any editor (e.g. Cursor, TextEdit, or `nano`):

```bash
# Replace with your actual path from Step 1
nano /opt/homebrew/var/postgres@14/pg_hba.conf
```

Find the two lines that look like this (near the bottom):

```
host    all    all    127.0.0.1/32    scram-sha-256
host    all    all    ::1/128         scram-sha-256
```

Change **only the last word** on each line from `scram-sha-256` to **`trust`**:

```
host    all    all    127.0.0.1/32    trust
host    all    all    ::1/128         trust
```

Save and close (in nano: Ctrl+O, Enter, Ctrl+X).

---

## Step 3: Restart Postgres

- **Postgres.app:** Click the elephant icon in the menu bar → **Stop** → then **Start**.
- **Homebrew:** Run (use your version number if different):

  ```bash
  brew services restart postgresql@14
  # or
  brew services restart postgres@14
  ```

  To see which service you have: `brew services list | grep postgres`

---

## Step 4: Set the postgres password (no password needed now)

```bash
psql -h localhost -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

If you see **"role postgres does not exist"**, create it and the database:

```bash
# Connect as your OS user (might work with trust)
psql -h localhost -U christophersmith -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';"
psql -h localhost -U christophersmith -d postgres -c "CREATE DATABASE tableshare_dev OWNER postgres;"
```

---

## Step 5: Revert pg_hba.conf (important)

Open `pg_hba.conf` again and change **`trust`** back to **`scram-sha-256`** on those two lines. Save, then restart Postgres again (Step 3).

---

## Step 6: Use it in TableShare

In `tableshare-backend/.env.local`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tableshare_dev
```

Then run migrations and seed:

```bash
cd /Users/christophersmith/Desktop/TableShare/tableshare-backend
node scripts/run-migrations.js
node scripts/seed-portal-users.js
```
