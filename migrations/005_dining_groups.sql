-- Dining groups table
CREATE TABLE IF NOT EXISTS dining_groups (
  group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name VARCHAR(255) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dining_groups_created_by ON dining_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_dining_groups_restaurant_id ON dining_groups(restaurant_id);

-- Add foreign key constraint to check_ins
ALTER TABLE check_ins ADD CONSTRAINT fk_check_ins_group_id 
  FOREIGN KEY (group_id) REFERENCES dining_groups(group_id) ON DELETE SET NULL;
