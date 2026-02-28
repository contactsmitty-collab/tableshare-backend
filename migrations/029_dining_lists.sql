-- Dining Lists: curated "Want to Try" lists; overlap = match signal
CREATE TABLE IF NOT EXISTS dining_lists (
  list_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  is_default BOOLEAN DEFAULT false, -- "Want to Try" default list
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dining_list_entries (
  list_id UUID NOT NULL REFERENCES dining_lists(list_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (list_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_dining_lists_user_id ON dining_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_dining_list_entries_list_id ON dining_list_entries(list_id);
CREATE INDEX IF NOT EXISTS idx_dining_list_entries_restaurant_id ON dining_list_entries(restaurant_id);
