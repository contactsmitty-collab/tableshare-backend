-- Seed "Discover" data (For You, Trending, Explore) for user Alice
-- Use the same DB user/password/database as your app (e.g. from .env.local DATABASE_URL).
--
-- If DATABASE_URL is postgresql://postgres:postgres@localhost:5432/tableshare_dev:
--   PGPASSWORD=postgres psql -h localhost -U postgres -d tableshare_dev -f scripts/seed-discover-for-alice.sql
--
-- If you use tableshare_user / tableshare_prod:
--   PGPASSWORD=your_actual_password psql -h localhost -U tableshare_user -d tableshare_prod -f scripts/seed-discover-for-alice.sql

DO $$
DECLARE
  alice_id UUID;
  r RECORD;
  idx INT := 0;
  reason_text TEXT;
  cuisine_choices TEXT[] := ARRAY['Italian', 'Japanese', 'American', 'Mexican', 'Thai', 'Indian', 'Mediterranean', 'French'];
BEGIN
  -- 1) Get or create Alice
  SELECT user_id INTO alice_id FROM users WHERE LOWER(TRIM(first_name)) = 'alice' LIMIT 1;
  IF alice_id IS NULL THEN
    INSERT INTO users (first_name, last_name, email, password_hash, date_of_birth)
    VALUES (
      'Alice',
      'Smith',
      'alice@test.com',
      COALESCE((SELECT password_hash FROM users LIMIT 1), '$2b$10$dummyhashforseeding123456789012345678'),
      '1990-01-15'
    )
    ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
    RETURNING user_id INTO alice_id;
    IF alice_id IS NULL THEN
      SELECT user_id INTO alice_id FROM users WHERE email = 'alice@test.com';
    END IF;
  END IF;

  IF alice_id IS NULL THEN
    RAISE EXCEPTION 'Could not find or create user Alice';
  END IF;

  RAISE NOTICE 'Using Alice user_id: %', alice_id;

  -- 2) Ensure taste profile for Alice (so For You and Explore work)
  INSERT INTO user_taste_profiles (
    user_id,
    cuisine_preferences,
    cuisine_exploration_score,
    profile_confidence,
    last_updated_at
  )
  VALUES (
    alice_id,
    '{"Italian": 0.85, "Japanese": 0.72, "American": 0.6, "Mexican": 0.55}'::jsonb,
    0.5,
    0.7,
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    cuisine_preferences = COALESCE(EXCLUDED.cuisine_preferences, user_taste_profiles.cuisine_preferences),
    last_updated_at = NOW();

  -- 3) For You: populate recommendation_cache with up to 20 restaurants
  DELETE FROM recommendation_cache WHERE user_id = alice_id AND recommendation_type = 'for_you';

  FOR r IN (
    SELECT restaurant_id, name, cuisine_type
    FROM restaurants
    WHERE (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'is_active')) = false
       OR is_active IS NOT FALSE
    ORDER BY COALESCE(rating, 0) DESC, name
    LIMIT 20
  )
  LOOP
    idx := idx + 1;
    reason_text := 'Recommended for you';
    IF r.cuisine_type IS NOT NULL AND r.cuisine_type != '' THEN
      reason_text := 'Because you enjoy ' || r.cuisine_type;
    END IF;
    INSERT INTO recommendation_cache (
      user_id,
      recommendation_type,
      restaurant_id,
      overall_score,
      reason_type,
      reason_description,
      expires_at
    )
    VALUES (
      alice_id,
      'for_you',
      r.restaurant_id,
      0.5 + (idx * 0.02),
      'taste_match',
      reason_text,
      NOW() + INTERVAL '24 hours'
    )
    ON CONFLICT (user_id, recommendation_type, restaurant_id)
    DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      reason_type = EXCLUDED.reason_type,
      reason_description = EXCLUDED.reason_description,
      computed_at = NOW(),
      expires_at = NOW() + INTERVAL '24 hours';
  END LOOP;

  RAISE NOTICE 'Inserted % For You recommendations for Alice', idx;

  -- 4) Trending: ensure trending_restaurants has recent rows (so /recommendations/trending returns data)
  idx := 0;
  FOR r IN (
    SELECT restaurant_id
    FROM restaurants
    WHERE (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'is_active')) = false
       OR is_active IS NOT FALSE
    ORDER BY COALESCE(rating, 0) DESC, name
    LIMIT 20
  )
  LOOP
    idx := idx + 1;
    INSERT INTO trending_restaurants (
      restaurant_id,
      checkin_velocity,
      unique_visitors_24h,
      unique_visitors_7d,
      trending_score,
      trend_direction,
      computed_at
    )
    VALUES (
      r.restaurant_id,
      1.5 + (idx * 0.1),
      idx + 2,
      idx + 5,
      0.5 + (idx * 0.02),
      CASE WHEN idx <= 5 THEN 'hot' WHEN idx <= 12 THEN 'rising' ELSE 'stable' END,
      NOW()
    )
    ON CONFLICT (restaurant_id)
    DO UPDATE SET
      trending_score = EXCLUDED.trending_score,
      trend_direction = EXCLUDED.trend_direction,
      computed_at = NOW();
  END LOOP;

  RAISE NOTICE 'Upserted % trending restaurant rows', idx;

  -- Explore uses live query (restaurants not yet visited by Alice); no seed needed.
  RAISE NOTICE 'Done. For You and Trending are populated for Alice; Explore will show restaurants she has not visited.';
END $$;
