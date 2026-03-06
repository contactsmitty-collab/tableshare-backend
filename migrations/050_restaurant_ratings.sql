-- Restaurant ratings (post-meal feedback)
CREATE TABLE IF NOT EXISTS restaurant_ratings (
  rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  check_in_id UUID REFERENCES check_ins(check_in_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_ratings_restaurant ON restaurant_ratings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_ratings_user ON restaurant_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_ratings_created ON restaurant_ratings(created_at DESC);

COMMENT ON TABLE restaurant_ratings IS 'User ratings for restaurants (post-checkout or post-visit)';

-- Points for restaurant rating
INSERT INTO point_rules (rule_type, points, description) 
VALUES ('restaurant_rating', 15, 'Points for rating a restaurant')
ON CONFLICT (rule_type) DO NOTHING;
