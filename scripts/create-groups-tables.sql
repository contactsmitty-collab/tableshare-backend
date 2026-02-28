-- Create dining_groups and group_members tables
-- Run this if migrations fail due to permissions

-- Create dining_groups table
CREATE TABLE IF NOT EXISTS dining_groups (
  group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name VARCHAR(255) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for dining_groups
CREATE INDEX IF NOT EXISTS idx_dining_groups_created_by ON dining_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_dining_groups_restaurant_id ON dining_groups(restaurant_id);

-- Create group_members table
CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES dining_groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);

-- Create indexes for group_members
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Add foreign key constraint to check_ins if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_check_ins_group_id'
  ) THEN
    ALTER TABLE check_ins 
    ADD CONSTRAINT fk_check_ins_group_id 
    FOREIGN KEY (group_id) REFERENCES dining_groups(group_id) ON DELETE SET NULL;
  END IF;
END $$;
