-- Extend users table with profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS conversation_preference VARCHAR(50) DEFAULT 'flexible';
ALTER TABLE users ADD COLUMN IF NOT EXISTS dietary_tags JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Note: device_tokens.user_id is now UUID from migration 002, no conversion needed
