# Database connection & migration troubleshooting

This doc covers the Postgres connection issues you can hit when running `npm run migrate` or the app, and how to fix them. The app expects a local Postgres with the URL in `.env.local`.

---

## What the app expects

- **File:** `tableshare-backend/.env.local`
- **Variable:** `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tableshare_dev`
- **Meaning:** user `postgres`, password `postgres`, database `tableshare_dev` on localhost.

The migration script (`scripts/run-migrations.js`) loads `.env.local` and then connects using `src/config/database.js`.

---

## Common errors and what they mean

### 1. `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`

- **Cause:** The `pg` library was receiving `null` for the password (e.g. empty string was treated as falsy and replaced with `null`).
- **Fix in codebase:** `src/config/database.js` now passes the password as a **function** that returns `Promise.resolve(passwordValue)`, so the client always gets a string. We also **don’t pass `connectionString`** into the Pool; we parse it and pass explicit options (`host`, `port`, `user`, `database`, `password`) so the password is never overwritten by the parser.

### 2. `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string`

- **Cause:** The password reaching the server was the empty string (e.g. you used the placeholder `youruser:yourpassword` or the URL had no password and our code was stripping it).
- **Fix:** Use real credentials in `DATABASE_URL` or `PGPASSWORD`. For local dev, the intended value is in `.env.local`: `postgres:postgres`.

### 3. Password was being stripped when using `postgres` in the URL

- **Cause:** The config had logic that said “if the user in the URL is `postgres`, replace with OS username (e.g. for macOS).” The replacement was building a new URL **without** the password, so you ended up connecting as your OS user with no password.
- **Fix in codebase:** That replacement now runs **only** when the URL has no password (`postgresql://postgres@...`). If the URL has a password (`postgresql://postgres:postgres@...`), it is left unchanged so `.env.local` works as-is.

### 4. `password authentication failed for user "postgres"`

- **Cause:** Postgres is rejecting user `postgres` with the password you’re sending. Either the `postgres` role has a different password, or it doesn’t exist.
- **Fix:** Reset or create the `postgres` user and set its password to `postgres` (see “When you don’t know any Postgres password” below), or use a different user in `DATABASE_URL` and create that user in Postgres.

### 5. `fe_sendauth: no password supplied` / `FATAL: password authentication failed for user "christophersmith"`

- **Cause:** Your Postgres is configured to require a password for all users (including your OS user). You don’t know the password, so you’re locked out.
- **Fix:** Use socket (peer) auth if possible, or temporarily switch to `trust` in `pg_hba.conf`, set the password, then switch back (see below).

---

## When you don’t know any Postgres password

If you can’t connect as `postgres` or as your OS user because you don’t know the password, use one of these approaches.

### Option A: Try socket connection (no password)

Sometimes connecting **without** `-h localhost` uses a Unix socket and peer authentication, so no password is needed:

```bash
psql -U christophersmith -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

(Use your actual OS username if different. If it still prompts for a password, use Option B.)

### Option B: Temporarily allow trust auth, set password, then revert

You need access to the Postgres config and the ability to restart Postgres.

1. **Find `pg_hba.conf`:**
   - **Postgres.app (Mac):** e.g. `~/Library/Application Support/Postgres/var-<version>/pg_hba.conf` (or use “Open config” from the app).
   - **Homebrew (Mac):** e.g. `$(brew --prefix)/var/postgresql@14/pg_hba.conf` or `opt/homebrew/var/postgres@14/pg_hba.conf` (version may differ).

2. **Edit `pg_hba.conf`:**  
   Find the lines for `localhost` (IPv4 and/or IPv6) that use `scram-sha-256` or `md5`. Change the auth method to **`trust`** for those lines, e.g.:

   ```
   host    all    all    127.0.0.1/32    trust
   host    all    all    ::1/128         trust
   ```

3. **Restart Postgres:**
   - Postgres.app: stop and start the server from the menu.
   - Homebrew: `brew services restart postgresql@14` (use your version).

4. **Connect and set the password** (no password needed while trust is on):

   ```bash
   psql -h localhost -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
   ```

   If you get “role postgres does not exist”, connect as a superuser (e.g. your OS user if it’s a superuser) and create the user and DB:

   ```bash
   psql -h localhost -U christophersmith -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';"
   psql -h localhost -U christophersmith -d postgres -c "CREATE DATABASE tableshare_dev OWNER postgres;"
   ```

5. **Revert `pg_hba.conf`:** Change `trust` back to `scram-sha-256` (or `md5`), save, and restart Postgres again.

After that, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tableshare_dev` in `.env.local` should work.

---

## Running migrations after fixing auth

From the backend root:

```bash
cd tableshare-backend
npm run migrate
```

Do **not** override `DATABASE_URL` in the shell unless you intend to use a different URL; the script loads `.env.local` and uses that.

---

## Quick reference

| Symptom | Likely cause | What to do |
|--------|----------------|------------|
| “client password must be a string” | pg got `null` for password | Already fixed in `src/config/database.js` (password function + explicit options). Ensure you’re on latest code. |
| “must be a non-empty string” | Empty or placeholder password | Put real credentials in `.env.local` (e.g. `postgres:postgres`) or in `DATABASE_URL`/`PGPASSWORD` for the migrate command. |
| “password authentication failed for user postgres” | Wrong or unknown password for `postgres` | Reset `postgres` password to `postgres` (Option A or B above) or use another user in `DATABASE_URL`. |
| “no password supplied” / auth failed for OS user | Server requires password and you don’t know it | Use socket (Option A) or trust in `pg_hba.conf` (Option B), then set a known password. |

---

## Related files

- **Config:** `tableshare-backend/src/config/database.js` — builds Pool from `DATABASE_URL` / parsed options, password always passed as a string (via function).
- **Migrations:** `tableshare-backend/scripts/run-migrations.js` — loads `.env.local` then uses the pool from `database.js`.
- **Credentials:** `tableshare-backend/.env.local` — set `DATABASE_URL` here for local dev (do not commit real secrets to git).
