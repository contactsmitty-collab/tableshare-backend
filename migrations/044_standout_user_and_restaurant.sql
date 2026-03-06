-- Stand-out: user columns (open to share, ideal dinner) and restaurant columns (noise_level, tableshare_offer).
-- PATCH /users/me and GET /users/me use these; app sends open_to_share_table, ideal_dinner_*.

-- Users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'open_to_share_table') THEN
    ALTER TABLE users ADD COLUMN open_to_share_table BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'ideal_dinner_cuisine') THEN
    ALTER TABLE users ADD COLUMN ideal_dinner_cuisine VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'ideal_dinner_vibe') THEN
    ALTER TABLE users ADD COLUMN ideal_dinner_vibe VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'ideal_dinner_group_size') THEN
    ALTER TABLE users ADD COLUMN ideal_dinner_group_size VARCHAR(50);
  END IF;
END $$;

-- Restaurants (for app detail: noise_level badge, tableshare_offer box)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'restaurants' AND column_name = 'noise_level') THEN
    ALTER TABLE restaurants ADD COLUMN noise_level VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'restaurants' AND column_name = 'tableshare_offer') THEN
    ALTER TABLE restaurants ADD COLUMN tableshare_offer TEXT;
  END IF;
END $$;
