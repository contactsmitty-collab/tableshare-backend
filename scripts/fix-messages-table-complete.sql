-- Fix messages table - add all missing columns
-- Run as postgres superuser: sudo -u postgres psql -d tableshare_prod -f scripts/fix-messages-table-complete.sql

-- Add all missing columns
DO $$
BEGIN
  -- Add match_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'match_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN match_id UUID;
    RAISE NOTICE '✅ Added match_id column';
  END IF;

  -- Add sender_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'sender_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN sender_id UUID;
    RAISE NOTICE '✅ Added sender_id column';
  END IF;

  -- Add message_text if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'message_text'
  ) THEN
    ALTER TABLE messages ADD COLUMN message_text TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Added message_text column';
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    RAISE NOTICE '✅ Added created_at column';
  END IF;

  -- Add read_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN read_at TIMESTAMP;
    RAISE NOTICE '✅ Added read_at column';
  END IF;

  -- Add is_read if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'is_read'
  ) THEN
    ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Added is_read column';
  END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
  -- match_id foreign key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_match_id_fkey'
  ) THEN
    ALTER TABLE messages 
    ADD CONSTRAINT messages_match_id_fkey 
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE;
    RAISE NOTICE '✅ Added match_id foreign key';
  END IF;

  -- sender_id foreign key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_id_fkey'
  ) THEN
    ALTER TABLE messages 
    ADD CONSTRAINT messages_sender_id_fkey 
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE;
    RAISE NOTICE '✅ Added sender_id foreign key';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Verify the schema
SELECT 'Messages table schema:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;
