-- Check-ins table
-- Note: group_id foreign key will be added in migration 005
CREATE TABLE IF NOT EXISTS check_ins (
  check_in_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  party_size INTEGER DEFAULT 1,
  notes TEXT,
  photo_url TEXT,
  check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  group_id UUID, -- Foreign key constraint added in migration 005
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant_id ON check_ins(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_group_id ON check_ins(group_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_is_active ON check_ins(is_active);
CREATE INDEX IF NOT EXISTS idx_check_ins_check_in_time ON check_ins(check_in_time);
