-- Invite a Guest: after match, initiator sends dinner invite; companion accepts with dietary pre-filled
CREATE TABLE IF NOT EXISTS dinner_invitations (
  invitation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  companion_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME,
  initiator_notes TEXT,
  companion_dietary_notes TEXT,
  suggested_date DATE,
  suggested_time TIME,
  suggested_notes TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, suggested_changes, declined
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (initiator_id != companion_id)
);

CREATE INDEX IF NOT EXISTS idx_dinner_invitations_initiator ON dinner_invitations(initiator_id);
CREATE INDEX IF NOT EXISTS idx_dinner_invitations_companion ON dinner_invitations(companion_id);
CREATE INDEX IF NOT EXISTS idx_dinner_invitations_status ON dinner_invitations(status);
