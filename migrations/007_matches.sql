-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  match_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected, completed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (requester_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_requester_id ON matches(requester_id);
CREATE INDEX IF NOT EXISTS idx_matches_receiver_id ON matches(receiver_id);
CREATE INDEX IF NOT EXISTS idx_matches_restaurant_id ON matches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
