-- Link reservations to dining groups (optional): "Book for my group"
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES dining_groups(group_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_group_id ON reservations(group_id);

COMMENT ON COLUMN reservations.group_id IS 'When set, this reservation is for a dining group; user_id is the booker (must be group member).';
