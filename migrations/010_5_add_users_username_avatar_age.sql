-- Add username, avatar_url, age to users so 011_add_open_seat_requests views can reference them
-- (013_update_users_table adds these later; this ensures they exist before 011)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS age INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
