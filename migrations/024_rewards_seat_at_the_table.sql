-- Seat at the Table: rewards overview, catalog, redemptions, tier and referral
-- Tier: first_course (0), main_course (4), chefs_table (10) shared tables

-- User points: add tier progress for Seat at the Table
ALTER TABLE user_points
  ADD COLUMN IF NOT EXISTS shared_tables_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS tier VARCHAR(30) DEFAULT 'first_course' NOT NULL;

-- Users: referral for "Pull Up a Chair"
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(user_id);

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

-- Rewards catalog (redeemable items)
CREATE TABLE IF NOT EXISTS rewards_catalog (
  reward_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  points_cost INTEGER NOT NULL,
  category VARCHAR(50) NOT NULL,
  emoji VARCHAR(10),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User redemptions
CREATE TABLE IF NOT EXISTS reward_redemptions (
  redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reward_id VARCHAR(64) NOT NULL REFERENCES rewards_catalog(reward_id),
  points_spent INTEGER NOT NULL,
  status VARCHAR(30) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON reward_redemptions(user_id);

-- Seed default rewards (idempotent)
INSERT INTO rewards_catalog (reward_id, name, subtitle, points_cost, category, emoji, active) VALUES
  ('credit-10', 'Dining Credit', '$10 at partner restaurants', 500, 'credit', '🍽️', true),
  ('credit-25', 'Dining Credit', '$25 at partner restaurants', 1200, 'credit', '🍽️', true),
  ('exp-tasting', 'Experience', 'Chef''s tasting for 2', 2000, 'experience', '👨‍🍳', true),
  ('exp-wine', 'Experience', 'Wine pairing evening', 1500, 'experience', '🍷', true),
  ('gift-amazon', 'Gift Card', '$15 Amazon Gift Card', 750, 'gift', '🎁', true),
  ('upgrade-premium', 'Upgrade', 'Premium profile for 1 month', 800, 'upgrade', '⭐', true)
ON CONFLICT (reward_id) DO NOTHING;
