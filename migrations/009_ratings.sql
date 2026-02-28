-- Ratings table
CREATE TABLE IF NOT EXISTS ratings (
  rating_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rated_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rating_value INTEGER NOT NULL CHECK (rating_value >= 1 AND rating_value <= 5),
  would_dine_again BOOLEAN,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_match_id ON ratings(match_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater_id ON ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rated_user_id ON ratings(rated_user_id);
