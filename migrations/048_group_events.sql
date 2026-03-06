-- Scheduled group dinners: plan a group dinner at a restaurant with date/time; members RSVP.
CREATE TABLE IF NOT EXISTS group_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES dining_groups(group_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'scheduled',
  title VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_events_group_id ON group_events(group_id);
CREATE INDEX IF NOT EXISTS idx_group_events_restaurant_id ON group_events(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_group_events_proposed_date ON group_events(proposed_date);
CREATE INDEX IF NOT EXISTS idx_group_events_created_by ON group_events(created_by);

CREATE TABLE IF NOT EXISTS group_event_rsvps (
  event_id UUID NOT NULL REFERENCES group_events(event_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_event_rsvps_event_id ON group_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_group_event_rsvps_user_id ON group_event_rsvps(user_id);

COMMENT ON TABLE group_events IS 'Scheduled group dinners: creator picks restaurant, date, time; group members get notified and can RSVP.';
