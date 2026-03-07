-- Phase 2.1: Restaurant availability (JSONB for windows, tableSizes, maxCovers, autoAccept)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS availability_settings JSONB;

-- Phase 2.2: Restaurant promotions
CREATE TABLE IF NOT EXISTS restaurant_promotions (
  id SERIAL PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  days VARCHAR(100),
  time_range VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_promotions_restaurant ON restaurant_promotions(restaurant_id);

COMMENT ON COLUMN restaurants.availability_settings IS 'JSON: {enabled, windows, tableSizes, maxCovers, autoAccept}';
COMMENT ON TABLE restaurant_promotions IS 'Promotions/offers per restaurant';
