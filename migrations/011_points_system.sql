-- Points System Tables
-- Tracks user points, transactions, and point rules

-- User points balance (denormalized for performance)
CREATE TABLE IF NOT EXISTS user_points (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0 NOT NULL,
  lifetime_points INTEGER DEFAULT 0 NOT NULL,
  current_streak INTEGER DEFAULT 0 NOT NULL,
  longest_streak INTEGER DEFAULT 0 NOT NULL,
  last_check_in_date DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Point transactions history
CREATE TABLE IF NOT EXISTS point_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'check_in', 'group_create', 'group_join', 'match_complete', 'rating', 'daily_bonus', 'streak_bonus'
  reference_id UUID, -- ID of related entity (check_in_id, group_id, match_id, etc.)
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at DESC);

-- Point rules configuration (for easy adjustment of point values)
CREATE TABLE IF NOT EXISTS point_rules (
  rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_type VARCHAR(50) UNIQUE NOT NULL,
  points INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default point rules
INSERT INTO point_rules (rule_type, points, description) VALUES
  ('check_in', 10, 'Points for checking in at a restaurant'),
  ('check_in_photo', 5, 'Bonus points for adding a photo to check-in'),
  ('group_create', 25, 'Points for creating a dining group'),
  ('group_join', 15, 'Points for joining a dining group'),
  ('match_complete', 50, 'Points for completing a match (both users dined together)'),
  ('rating_submit', 20, 'Points for submitting a rating'),
  ('daily_bonus', 5, 'Bonus points for checking in on consecutive days'),
  ('streak_3', 10, 'Bonus for 3-day streak'),
  ('streak_7', 25, 'Bonus for 7-day streak'),
  ('streak_14', 50, 'Bonus for 14-day streak'),
  ('streak_30', 100, 'Bonus for 30-day streak')
ON CONFLICT (rule_type) DO NOTHING;

-- User badges/achievements (optional for future)
CREATE TABLE IF NOT EXISTS user_badges (
  badge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  badge_type VARCHAR(50) NOT NULL, -- 'first_check_in', 'social_butterfly', 'foodie', 'streak_master', etc.
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
