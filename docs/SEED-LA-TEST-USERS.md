# Seeding Los Angeles for Test Users

Use this when you have test users in **Los Angeles** so they see local restaurants and bars instead of an empty or Chicago-only feed.

---

## 1. Add LA restaurants and bars

From the backend repo:

```bash
cd tableshare-backend
PGPASSWORD=postgres psql -h localhost -U postgres -d tableshare_dev -f scripts/seed-la-restaurants.sql
```

(Use your actual DB user/password/database; same as `.env.local` or your deploy.)

**What it adds:**

- **12 LA bars/lounges/rooftops** – e.g. The Standard Rooftop, Spire 73, The Edison, Bar Marmont, The Bungalow (Santa Monica), E.P. & L.P., etc. All with `city = 'Los Angeles'`, real addresses, and lat/lng so they show in “Near You” and “Bars & Nightclubs” when the user is in LA.
- **20 LA restaurants** – mix of cuisines (French, Italian, Oaxacan, Korean, Japanese, Thai, Pizza, Mediterranean, Steakhouse, etc.) and neighborhoods (Downtown, Silver Lake, Venice, West Hollywood, Koreatown). Again `city = 'Los Angeles'` and coordinates for distance/location features.

Safe to run more than once (uses `ON CONFLICT (restaurant_id) DO NOTHING`).

---

## 2. Make sure test users “are” in LA

- **Device location:** Testers should allow location and be in LA (or simulate location in LA) so “Near You”, “Trending Now”, and distance-based APIs return these venues.
- **Profile city (optional):** If your app or backend uses profile `city` or `neighborhood` for filtering, set test accounts to Los Angeles so feeds and filters are consistent.

---

## 3. Optional: Discover (For You / Trending / Explore) for an LA tester

To give one LA test user a full “For You” and “Trending” experience:

1. Create or pick a user (e.g. `alice@test.com` or a dedicated LA tester).
2. Run the Discover seed **for that user** (same pattern as `seed-discover-for-alice.sql` but for your LA test user’s `user_id`), or run the existing Alice seed and have the LA tester log in as Alice.

The LA restaurants you added will then be eligible to appear in that user’s Discover and recommendation cache.

---

## Summary

| Goal | Action |
|------|--------|
| LA venues in the app | Run `scripts/seed-la-restaurants.sql` |
| “Near You” / distance features show LA spots | Test with device (or simulated) location in LA |
| For You / Trending populated for one LA tester | Run Discover seed for that user (e.g. `seed-discover-for-alice.sql` with that account) |

After seeding, LA test users should see Los Angeles restaurants and bars in Home, Search, Near You, Bars & Nightclubs, and Discover when location is set to LA.
