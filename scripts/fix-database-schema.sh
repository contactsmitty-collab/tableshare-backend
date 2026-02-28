#!/bin/bash
# Fix missing database tables and columns
# Run this on the server: bash scripts/fix-database-schema.sh

cd /opt/tableshare-backend

echo "🔧 Fixing database schema..."

PGPASSWORD=tableshare_secure_pass_2026 psql -h localhost -U tableshare_user -d tableshare_prod << 'EOF'
-- 1. Fix messages table - add message_text column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'message_text'
  ) THEN
    ALTER TABLE messages ADD COLUMN message_text TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Added message_text column to messages table';
  ELSE
    RAISE NOTICE '✅ message_text column already exists';
  END IF;
END $$;

-- 2. Create conversation_prompts table if it doesn't exist
CREATE TABLE IF NOT EXISTS conversation_prompts (
  prompt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_text TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  context VARCHAR(50) DEFAULT 'any',
  cuisine_type VARCHAR(100),
  time_of_day VARCHAR(20),
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_prompts_category ON conversation_prompts(category);
CREATE INDEX IF NOT EXISTS idx_conversation_prompts_context ON conversation_prompts(context);
CREATE INDEX IF NOT EXISTS idx_conversation_prompts_cuisine ON conversation_prompts(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_conversation_prompts_active ON conversation_prompts(is_active);

-- 3. Create prompt_usage table if it doesn't exist
CREATE TABLE IF NOT EXISTS prompt_usage (
  usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id UUID NOT NULL REFERENCES conversation_prompts(prompt_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(match_id) ON DELETE SET NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_usage_prompt_id ON prompt_usage(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_user_id ON prompt_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_match_id ON prompt_usage(match_id);

-- 4. Insert seed data if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM conversation_prompts LIMIT 1) THEN
    INSERT INTO conversation_prompts (prompt_text, category, context) VALUES
    ('Hey! Nice to meet you 👋', 'general', 'first_message'),
    ('Hi there! How are you doing?', 'general', 'first_message'),
    ('Hello! Excited to connect!', 'general', 'first_message'),
    ('Hey! What brings you here today?', 'general', 'first_message'),
    ('Hi! How has your day been?', 'general', 'any'),
    ('What are you up to?', 'general', 'any'),
    ('What kind of food are you in the mood for?', 'food', 'first_message'),
    ('Any favorite cuisines?', 'food', 'first_message'),
    ('What''s your go-to comfort food?', 'food', 'any'),
    ('Have you tried anything new recently?', 'food', 'any'),
    ('Have you been to this restaurant before?', 'restaurant', 'first_message'),
    ('What do you think of this place?', 'restaurant', 'first_message'),
    ('Any recommendations for what to order?', 'restaurant', 'any'),
    ('Tell me something interesting about yourself!', 'fun', 'first_message'),
    ('What''s the most adventurous thing you''ve done?', 'fun', 'any'),
    ('If you could travel anywhere, where would you go?', 'fun', 'any'),
    ('What''s something you''re passionate about?', 'deep', 'any'),
    ('What motivates you in life?', 'deep', 'any');
    
    RAISE NOTICE '✅ Inserted seed prompts';
  ELSE
    RAISE NOTICE '✅ conversation_prompts already has data';
  END IF;
END $$;

-- Verify
SELECT 'Messages table columns:' as info;
SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' ORDER BY ordinal_position;

SELECT 'Prompts count:' as info;
SELECT COUNT(*) as count FROM conversation_prompts;
EOF

echo ""
echo "✅ Database schema fixed!"
echo "🔄 Restarting API..."
pm2 restart tableshare-api

echo ""
echo "✅ Done! Both issues should be fixed now."
