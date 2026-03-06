-- Activity feed (Phase 4.4): opt-in activity from matches for re-engagement

-- User preference: show my activity to matched users (friends)
CREATE TABLE IF NOT EXISTS user_activity_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  show_my_activity BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activities: check-in, added_to_list, etc.
CREATE TABLE IF NOT EXISTS activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL DEFAULT 'restaurant',
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

COMMENT ON TABLE user_activity_preferences IS 'Whether to show this user’s activity in friends’ feed';
COMMENT ON TABLE activities IS 'Feed events: check_in, added_to_list; target_type/target_id point to restaurant etc.';
