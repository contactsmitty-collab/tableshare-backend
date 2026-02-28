-- Instagram OAuth table (optional)
CREATE TABLE IF NOT EXISTS instagram_oauth (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  instagram_user_id VARCHAR(255) UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instagram_oauth_user_id ON instagram_oauth(user_id);
