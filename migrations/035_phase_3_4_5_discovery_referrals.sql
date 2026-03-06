-- Phase 3: Discovery & Restaurant
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS specials TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS open_now BOOLEAN; -- optional: set by job or admin
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN DEFAULT false;

-- Phase 4: Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  referred_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

-- Optional: recent restaurants per user (backend option for Phase 3.2)
CREATE TABLE IF NOT EXISTS user_recent_restaurants (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_recent_restaurants_user ON user_recent_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_recent_restaurants_viewed ON user_recent_restaurants(viewed_at DESC);

COMMENT ON TABLE referrals IS 'Referral program: referrer and referred users, code, status';
COMMENT ON TABLE user_recent_restaurants IS 'Recently viewed restaurants per user (for discovery)';
