# Restaurant Seeding & Avoiding Duplicates

This doc explains how restaurant data is loaded, why duplicates appear, and how to **prevent duplicates** when onboarding a new city or neighborhood.

---

## Is there a master list?

**No.** There is no single “master list” file. Restaurant data comes from:

- **Migrations** in `migrations/` (e.g. `001_initial.sql`, `007_add_chicago_bars.sql`, `026_fix_chicago_restaurants_uuid.sql`, `037_seed_chicago_neighborhoods_pilot.sql`)
- **Scripts** (e.g. `scripts/seed-la-restaurants.sql`, `scripts/remove-duplicate-restaurants.sql`)

Different migrations can insert the **same venue** (e.g. “Alinea”, “The Aviary”) with **different `restaurant_id` UUIDs**. The app then shows the same place multiple times in Featured, Near You, Good for Dinner, Bars & Nightclubs, etc.

---

## How we prevent duplicates in the app (now)

1. **Backend** – Every endpoint that returns a **list of restaurants** runs results through `dedupeByVenue(rows)`, which keeps one row per unique `(name, city)` (case-insensitive). So even if the DB has duplicate rows, each venue appears at most once in:
   - `GET /restaurants`
   - `GET /restaurants/featured`
   - `GET /restaurants/featured/bars-nightclubs`
   - `GET /restaurants/nearby`
   - `GET /restaurants/search`
   - `GET /restaurants/trending`
   - `GET /restaurants/popular-with-tablesharers`
   - `GET /restaurants/category/:category`
   - `GET /restaurants/new`
   - `GET /restaurants/time-based` (Good for Dinner, etc.)
   - `GET /restaurants/by-vibe`
   - Any other list endpoint that returns `restaurants`.

2. **Frontend** – Lists are also deduped by venue (e.g. `dedupeByVenue`) in `api.ts` for featured, nearby, bars, time-based, trending, popular, and vibe results.

3. **DB cleanup** – Migration `038_remove_duplicate_restaurants.sql` merges duplicate restaurant rows (same normalized name + city): it keeps one `restaurant_id`, points all references (e.g. `dining_groups`, `check_ins`) to that id, and deletes the extra rows. Run it after seeding to clean the database.

---

## How to prevent duplicates when onboarding a new city or neighborhood

### 1. Use one migration per city/neighborhood

- Create **one** migration file for that city (e.g. `039_seed_austin_restaurants.sql`).
- Put **all** venues for that city in that file.
- Do **not** add the same city’s venues again in a later migration unless you are intentionally **replacing** or **fixing** data (e.g. fixing UUIDs).

### 2. Avoid re-inserting the same venue

- Before writing a new migration, search the repo for the **venue name** and **city** to see if it already exists in another migration or script.
- If it already exists, **reuse the same `restaurant_id`** (UUID) if you need to “fix” or “update” that row; otherwise do not insert it again.

### 3. Use a stable, unique `restaurant_id` per venue

- Prefer **deterministic UUIDs** (e.g. from name + city) or a single, well-known UUID per venue so that:
  - Re-running the migration is safe with `ON CONFLICT (restaurant_id) DO NOTHING` (or `DO UPDATE`).
  - You never create a second row for the same place with a different id.

### 4. After seeding, run the duplicate-cleanup migration

- Run **`038_remove_duplicate_restaurants.sql`** after any bulk seed (new city or neighborhood).
- It merges rows that share the same normalized `(name, city)` and updates all references.

### 5. (Optional) Enforce uniqueness in the database

To make it harder to insert duplicates in the future, you can add a unique constraint and use “insert or ignore” in seeds:

```sql
-- Optional: add unique constraint on normalized (name, city)
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_name_city_unique
ON restaurants (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, ''))));
```

Then in migrations, use `ON CONFLICT` on that unique index (or keep using `ON CONFLICT (restaurant_id) DO NOTHING` with deterministic UUIDs).

---

## Summary

| Question | Answer |
|----------|--------|
| Is there a master list? | No. Restaurants come from multiple migrations and scripts. |
| Why do Alinea / The Aviary / etc. show 2–3 times? | Same venue was inserted in more than one migration with different `restaurant_id`s. |
| How are duplicates hidden in the app? | Backend and frontend dedupe every restaurant list by `(name, city)`. |
| How do I clean the DB? | Run `038_remove_duplicate_restaurants.sql`. |
| How do I avoid duplicates for a new city? | One migration per city; don’t re-insert same venue; use stable UUIDs; run 038 after seeding. |
