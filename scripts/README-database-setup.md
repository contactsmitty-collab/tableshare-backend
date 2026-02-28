# Local database connection

Your app expects `postgresql://postgres:postgres@localhost:5432/tableshare_dev`.  
If you get **"password authentication failed for user postgres"**, do one of the following.

## Option A: Reset the `postgres` user password (recommended)

From a terminal, connect **without** a password (using peer/socket auth), then set the password:

**If you use Postgres.app or Homebrew on Mac:**

```bash
# Connect as your Mac user (often works without a password)
psql -h localhost -U $(whoami) -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

If that fails with "role postgres does not exist", create it and set the DB:

```bash
psql -h localhost -U $(whoami) -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';"
psql -h localhost -U $(whoami) -d postgres -c "CREATE DATABASE tableshare_dev OWNER postgres;"
```

**If you use system Postgres (Linux) or need socket auth:**

```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

Then run migrations:

```bash
npm run migrate
```

---

## Option B: Use your Mac username instead of `postgres`

If your install only allows your OS user, create the dev DB and point the app at it:

```bash
# Create DB (if it doesn't exist)
createdb tableshare_dev

# In tableshare-backend/.env.local set:
# DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/tableshare_dev
```

Replace `YOUR_MAC_USERNAME` with the output of `whoami`.  
If Postgres still asks for a password, set that user’s password in Postgres and add it to the URL:  
`postgresql://YOUR_MAC_USERNAME:yourpassword@localhost:5432/tableshare_dev`.

---

## Option C: See how you can connect now

List roles and try a connection:

```bash
# Who am I?
whoami

# Try connecting with no password (peer auth)
psql -h localhost -U $(whoami) -d postgres -c "SELECT 1"

# If that works, list users
psql -h localhost -U $(whoami) -d postgres -c "\du"
```

Use the **username that works** in `DATABASE_URL` in `.env.local`, and set that user’s password in Postgres if required.
