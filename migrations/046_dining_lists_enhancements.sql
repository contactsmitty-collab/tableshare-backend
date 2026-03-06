-- Dining lists: rename, set default, reorder lists; notes and position per entry; collaborative editors

-- List: sort_order for drag-to-reorder (lower = first)
ALTER TABLE dining_lists ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
UPDATE dining_lists SET sort_order = 0 WHERE is_default = true;

-- Entry: notes (e.g. "Try the ribeye"), position for ordering (lower = top)
ALTER TABLE dining_list_entries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE dining_list_entries ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Collaborative: editors can add/remove restaurants (owner = dining_lists.user_id)
CREATE TABLE IF NOT EXISTS dining_list_members (
  list_id UUID NOT NULL REFERENCES dining_lists(list_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dining_list_members_user ON dining_list_members(user_id);
