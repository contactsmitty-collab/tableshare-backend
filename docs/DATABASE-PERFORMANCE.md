# Database performance

Quick reference for keeping the TableShare Postgres database fast.

---

## Indexes (migration 039)

Run the performance migration so the planner can use indexes on hot paths:

```bash
npm run migrate
```

Or apply the file directly:

```bash
psql $DATABASE_URL -f migrations/039_performance_indexes.sql
```

**What it adds:**

| Table        | Index / purpose |
|-------------|------------------|
| restaurants | `(COALESCE(rating,0) DESC)` for featured/vibe/category ordering |
| restaurants | `(created_at DESC)` for “new restaurants” |
| restaurants | `(city, rating DESC)` for city-scoped lists |
| check_ins   | `(restaurant_id, check_in_time DESC)` for hot/recent check-ins |
| check_ins   | Partial index for active check-ins by restaurant + time |
| check_ins   | `(check_in_time DESC)` for feeds |
| matches     | `(restaurant_id, status, created_at)` for popular-with-tablesharers |
| matches     | `(status, created_at)` for listing matches |
| dining_groups | `(checked_in_restaurant_id)` and time for Group Dining vibe (if columns exist) |
| open_seats  | `(status, expires_at)` for open-seat discovery |
| reservations | `(user_id, reservation_date DESC)` for upcoming |

Then it runs **ANALYZE** on these tables so the planner has up-to-date statistics.

---

## Connection pool (already configured)

In `src/config/database.js`:

- **max: 20** connections per process.
- **idleTimeoutMillis: 30000**, **connectionTimeoutMillis: 2000**.
- **QUERY_TIMEOUT_MS**: 30s (configurable via `DB_QUERY_TIMEOUT_MS`).

For a single Node process this is usually enough. If you run multiple workers or servers, ensure total connections stay under Postgres `max_connections`.

---

## Refreshing stats after bulk changes

After large imports or deletes, refresh statistics so the planner chooses good plans:

```bash
psql $DATABASE_URL -c "ANALYZE;"
```

Or per table:

```bash
psql $DATABASE_URL -c "ANALYZE restaurants; ANALYZE check_ins;"
```

---

## Optional: periodic VACUUM

On a busy database, periodic **VACUUM** (and optionally **VACUUM ANALYZE**) keeps bloat down and stats fresh. Many setups use pg_cron or a scheduler:

```sql
VACUUM (ANALYZE) restaurants;
VACUUM (ANALYZE) check_ins;
```

Autovacuum is on by default in Postgres; the above is for manual tuning if needed.
