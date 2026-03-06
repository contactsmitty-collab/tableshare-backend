-- Performance: indexes for hot query paths (restaurant lists, check-ins, matches, dining groups).
-- Safe to run: all CREATE INDEX IF NOT EXISTS. Run ANALYZE at end to refresh planner stats.

-- ============ restaurants ============
-- Featured, by-vibe, category, time-based: ORDER BY COALESCE(rating, 0) DESC
CREATE INDEX IF NOT EXISTS idx_restaurants_rating_desc
  ON restaurants ((COALESCE(rating, 0)) DESC);

-- New restaurants: ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_restaurants_created_at_desc
  ON restaurants (created_at DESC NULLS LAST);

-- List/filter by city + rating (featured in city, search)
CREATE INDEX IF NOT EXISTS idx_restaurants_city_rating
  ON restaurants (city, rating DESC NULLS LAST)
  WHERE city IS NOT NULL AND city != '';

-- ============ check_ins ============
-- Hot right now / vibe: filter by restaurant + recent check_in_time (last 4 hours)
CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant_time
  ON check_ins (restaurant_id, check_in_time DESC);

-- Active check-ins for a restaurant (status = 'active' or is_active = true)
CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant_active_time
  ON check_ins (restaurant_id, check_in_time DESC)
  WHERE status = 'active';

-- Fallback if only is_active exists (004 schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'is_active') THEN
    CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant_active_is_active
      ON check_ins (restaurant_id, check_in_time DESC)
      WHERE is_active = true;
  END IF;
END $$;

-- Recent check-ins (feed, activity): ORDER BY check_in_time DESC
CREATE INDEX IF NOT EXISTS idx_check_ins_check_in_time_desc
  ON check_ins (check_in_time DESC);

-- ============ matches ============
-- Popular with table sharers: JOIN matches WHERE status IN (...) AND created_at >= ...
CREATE INDEX IF NOT EXISTS idx_matches_restaurant_status_created
  ON matches (restaurant_id, status, created_at DESC);

-- List matches by status and recency
CREATE INDEX IF NOT EXISTS idx_matches_status_created
  ON matches (status, created_at DESC);

-- ============ dining_groups ============
-- Group Dining vibe: JOIN on checked_in_restaurant_id, filter is_active, checked_in_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dining_groups' AND column_name = 'checked_in_restaurant_id') THEN
    CREATE INDEX IF NOT EXISTS idx_dining_groups_checked_in_restaurant
      ON dining_groups (checked_in_restaurant_id)
      WHERE checked_in_restaurant_id IS NOT NULL;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dining_groups' AND column_name = 'checked_in_at') THEN
      CREATE INDEX IF NOT EXISTS idx_dining_groups_checked_in_at
        ON dining_groups (checked_in_restaurant_id, checked_in_at DESC)
        WHERE checked_in_restaurant_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============ open_seats ============
-- List open seats: status = 'open', expires_at > NOW(), ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_open_seats_open_expires
  ON open_seats (status, expires_at)
  WHERE status = 'open';

-- ============ reservations ============
-- Upcoming / by date
CREATE INDEX IF NOT EXISTS idx_reservations_user_date
  ON reservations (user_id, reservation_date DESC);

-- ============ Refresh planner statistics ============
ANALYZE restaurants;
ANALYZE check_ins;
ANALYZE matches;
ANALYZE dining_groups;
ANALYZE open_seats;
ANALYZE reservations;
