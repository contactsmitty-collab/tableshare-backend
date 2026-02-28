-- Fix messages table - add message_text column if missing
-- Run this on the server: PGPASSWORD=tableshare_secure_pass_2026 psql -h localhost -U tableshare_user -d tableshare_prod -f scripts/fix-messages-table.sql

-- Check and add message_text column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'message_text'
  ) THEN
    ALTER TABLE messages ADD COLUMN message_text TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Added message_text column to messages table';
  ELSE
    RAISE NOTICE 'message_text column already exists';
  END IF;
END $$;

-- Verify the schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;
