-- Migration: Add missing columns to users table
-- Created: 2026-02-18

-- Add missing columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(100),
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS interests TEXT[],
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add check constraint for age
ALTER TABLE users ADD CONSTRAINT check_age_positive CHECK (age IS NULL OR age > 0);

-- Update existing users with generated usernames from their email
UPDATE users
SET username = SPLIT_PART(email, '@', 1)
WHERE username IS NULL;

-- Create index on username for lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create index on email for faster auth lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Update the active_check_ins view with correct columns
DROP VIEW IF EXISTS active_check_ins;
CREATE OR REPLACE VIEW active_check_ins AS
SELECT
    ci.*,
    COALESCE(u.username, SPLIT_PART(u.email, '@', 1)) as username,
    u.first_name,
    u.last_name,
    u.avatar_url,
    u.age,
    u.bio,
    r.name as restaurant_name,
    r.photo_url as restaurant_photo
FROM check_ins ci
JOIN users u ON ci.user_id = u.user_id
JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
WHERE ci.status = 'active';

COMMENT ON TABLE users IS 'User accounts with profile information';
