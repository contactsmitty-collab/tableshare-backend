-- Conversation Prompts and Icebreakers
-- Helps users start conversations with their dining matches

-- Prompts table
CREATE TABLE IF NOT EXISTS conversation_prompts (
  prompt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_text TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'general', 'food', 'restaurant', 'fun', 'deep', 'travel', 'hobbies'
  context VARCHAR(50), -- 'first_message', 'mid_conversation', 'any'
  cuisine_type VARCHAR(100), -- Optional: filter by cuisine type
  time_of_day VARCHAR(20), -- Optional: 'morning', 'afternoon', 'evening', 'any'
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompts_category ON conversation_prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_context ON conversation_prompts(context);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON conversation_prompts(is_active);

-- Prompt usage tracking (optional - for analytics)
CREATE TABLE IF NOT EXISTS prompt_usage (
  usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id UUID NOT NULL REFERENCES conversation_prompts(prompt_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(match_id) ON DELETE SET NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_usage_prompt_id ON prompt_usage(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_user_id ON prompt_usage(user_id);

-- Insert seed prompts
INSERT INTO conversation_prompts (prompt_text, category, context, cuisine_type, time_of_day) VALUES
-- General icebreakers
('Hey! Excited to meet you for dinner! What are you most looking forward to trying?', 'general', 'first_message', NULL, 'any'),
('Hi! I saw we matched - looking forward to sharing a meal together!', 'general', 'first_message', NULL, 'any'),
('Hey there! What brings you to this restaurant?', 'general', 'first_message', NULL, 'any'),
('Hi! I''m excited to meet you. What''s your favorite type of cuisine?', 'general', 'first_message', NULL, 'any'),

-- Food-related
('What''s the best meal you''ve had recently?', 'food', 'any', NULL, 'any'),
('Are you a foodie? What''s your go-to comfort food?', 'food', 'any', NULL, 'any'),
('I''m curious - what''s your favorite dish here?', 'food', 'any', NULL, 'any'),
('Do you like to try new foods or stick to favorites?', 'food', 'any', NULL, 'any'),
('What''s one food you''ve always wanted to try but haven''t?', 'food', 'any', NULL, 'any'),
('Are you adventurous with food or prefer familiar flavors?', 'food', 'any', NULL, 'any'),

-- Restaurant-specific
('Have you been here before? What should I order?', 'restaurant', 'first_message', NULL, 'any'),
('What do you think about the atmosphere here?', 'restaurant', 'any', NULL, 'any'),
('I love the vibe of this place! What caught your eye?', 'restaurant', 'first_message', NULL, 'any'),

-- Fun & Light
('Quick question: pineapple on pizza - yes or no?', 'fun', 'any', NULL, 'any'),
('What''s your superpower? Mine is finding the best food spots!', 'fun', 'any', NULL, 'any'),
('If you could only eat one cuisine for the rest of your life, what would it be?', 'fun', 'any', NULL, 'any'),
('What''s the weirdest food combination you actually love?', 'fun', 'any', NULL, 'any'),
('Coffee or tea person?', 'fun', 'any', NULL, 'any'),

-- Deeper conversation
('What''s something you''re passionate about?', 'deep', 'mid_conversation', NULL, 'any'),
('What''s the best travel experience you''ve had related to food?', 'travel', 'any', NULL, 'any'),
('Do you cook? What''s your signature dish?', 'hobbies', 'any', NULL, 'any'),
('What''s a food memory that always makes you smile?', 'deep', 'any', NULL, 'any'),

-- Cuisine-specific prompts
('I''m excited to try some authentic Italian food! Are you a pasta or pizza person?', 'food', 'first_message', 'Italian', 'any'),
('Sushi is one of my favorites! Do you prefer rolls or sashimi?', 'food', 'first_message', 'Japanese', 'any'),
('Mexican food is the best! What''s your go-to order?', 'food', 'first_message', 'Mexican', 'any'),
('I love trying new cuisines! What drew you to this place?', 'food', 'first_message', NULL, 'any'),

-- Time-specific
('Good morning! Ready for a great meal?', 'general', 'first_message', NULL, 'morning'),
('Afternoon vibes! How''s your day going?', 'general', 'first_message', NULL, 'afternoon'),
('Evening plans! What are you in the mood for?', 'general', 'first_message', NULL, 'evening')
ON CONFLICT DO NOTHING;
