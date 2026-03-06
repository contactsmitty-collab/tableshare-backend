-- Phase 0 & 1: Feedback, notification preferences, blocks, reports, hide_from_discover

-- Feedback (contact support)
CREATE TABLE IF NOT EXISTS user_feedback (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at);

-- Notification preferences (per user)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  matches BOOLEAN DEFAULT true,
  messages BOOLEAN DEFAULT true,
  reservations BOOLEAN DEFAULT true,
  promotions BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
  id SERIAL PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Reports (user or restaurant)
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  reason VARCHAR(100),
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

-- Hide from Discover (privacy)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_from_discover BOOLEAN DEFAULT false;

COMMENT ON TABLE user_feedback IS 'User feedback / contact support submissions';
COMMENT ON TABLE user_notification_preferences IS 'Push notification category toggles per user';
COMMENT ON TABLE user_blocks IS 'Blocked users for trust and safety';
COMMENT ON TABLE reports IS 'Reports against users or restaurants';
