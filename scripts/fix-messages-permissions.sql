-- Fix messages table permissions and add missing column
-- Run as postgres superuser: sudo -u postgres psql -d tableshare_prod -f scripts/fix-messages-permissions.sql

-- Grant ownership of messages table to tableshare_user
ALTER TABLE messages OWNER TO tableshare_user;

-- Now add the column (this will work after ownership change)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_text TEXT NOT NULL DEFAULT '';

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;
