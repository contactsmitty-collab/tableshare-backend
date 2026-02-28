-- Add missing conversation prompts for categories: lifestyle, dating, chicago, networking
-- Also add prompts to 'all' category (which just includes prompts from all categories)

-- Lifestyle prompts
INSERT INTO conversation_prompts (prompt_text, category, context, cuisine_type, time_of_day, is_active) VALUES
('What''s your ideal weekend look like?', 'lifestyle', 'first_message', NULL, 'any', true),
('I''m all about work-life balance. How do you unwind after a busy week?', 'lifestyle', 'first_message', NULL, 'any', true),
('Do you prefer a chill night in or an adventurous night out?', 'lifestyle', 'first_message', NULL, 'any', true),
('What hobbies are you passionate about?', 'lifestyle', 'first_message', NULL, 'any', true),
('How do you like to start your mornings?', 'lifestyle', 'first_message', NULL, 'morning', true),
('Tea or coffee person?', 'lifestyle', 'first_message', NULL, 'any', true),
('What''s your favorite way to stay active?', 'lifestyle', 'first_message', NULL, 'any', true),
('Are you a planner or more spontaneous?', 'lifestyle', 'first_message', NULL, 'any', true),
('Books or podcasts? What''s your current recommendation?', 'lifestyle', 'first_message', NULL, 'any', true),
('What''s something you''re currently learning or want to learn?', 'lifestyle', 'first_message', NULL, 'any', true);

-- Dating prompts
INSERT INTO conversation_prompts (prompt_text, category, context, cuisine_type, time_of_day, is_active) VALUES
('What''s your idea of a perfect date?', 'dating', 'first_message', NULL, 'any', true),
('What qualities do you value most in a partner?', 'dating', 'first_message', NULL, 'any', true),
('What''s the most romantic restaurant you''ve been to?', 'dating', 'first_message', NULL, 'any', true),
('Are you looking for something casual or serious?', 'dating', 'first_message', NULL, 'any', true),
('What''s your love language? Mine is definitely food!', 'dating', 'first_message', NULL, 'any', true),
('What''s your favorite thing to do on a Friday night?', 'dating', 'first_message', NULL, 'any', true),
('What makes you laugh the hardest?', 'dating', 'first_message', NULL, 'any', true),
('What are you passionate about in life?', 'dating', 'first_message', NULL, 'any', true),
('What''s a dealbreaker for you in a relationship?', 'dating', 'first_message', NULL, 'any', true),
('What are your thoughts on splitting the bill vs. treating?', 'dating', 'first_message', NULL, 'any', true);

-- Chicago prompts
INSERT INTO conversation_prompts (prompt_text, category, context, cuisine_type, time_of_day, is_active) VALUES
('Best deep dish pizza in Chicago - Giordano''s, Lou Malnati''s, or somewhere else?', 'chicago', 'first_message', 'italian', 'any', true),
('What''s your favorite Chicago neighborhood for dining?', 'chicago', 'first_message', NULL, 'any', true),
('Have you been to any of the new restaurants on Restaurant Row?', 'chicago', 'first_message', NULL, 'any', true),
('Lakefront trail or the 606 for a pre-dinner walk?', 'chicago', 'first_message', NULL, 'any', true),
('What''s the most underrated food scene in Chicago?', 'chicago', 'first_message', NULL, 'any', true),
('Summer patio season is the best! Favorite outdoor dining spot?', 'chicago', 'first_message', NULL, 'any', true),
(' Cubs, Sox, or just here for the food?', 'chicago', 'first_message', NULL, 'any', true),
('Ever tried the Chicago-style hot dog debate? Ketchup or no ketchup?', 'chicago', 'first_message', 'american', 'any', true),
('What''s your go-to spot in Wicker Park or Logan Square?', 'chicago', 'first_message', NULL, 'any', true),
('Have you checked out any of the amazing museums here?', 'chicago', 'first_message', NULL, 'any', true);

-- Networking prompts
INSERT INTO conversation_prompts (prompt_text, category, context, cuisine_type, time_of_day, is_active) VALUES
('What industry are you in? Always curious to learn about different fields!', 'networking', 'first_message', NULL, 'any', true),
('What''s your current role, and what do you love most about it?', 'networking', 'first_message', NULL, 'any', true),
('Always happy to connect with fellow professionals! What brings you to TableShare?', 'networking', 'first_message', NULL, 'any', true),
('Looking to expand my network. What''s your expertise area?', 'networking', 'first_message', NULL, 'any', true),
('I''m working on some interesting projects. Would love to hear what you''re passionate about!', 'networking', 'first_message', NULL, 'any', true),
('Coffee meetings are the best networking! What do you do?', 'networking', 'first_message', NULL, 'any', true),
('Always interested in meeting entrepreneurs and innovators. What''s your story?', 'networking', 'first_message', NULL, 'any', true),
('Would love to hear about your career journey. What''s been your biggest learning?', 'networking', 'first_message', NULL, 'any', true),
('I believe great connections happen over great food! What field are you in?', 'networking', 'first_message', NULL, 'any', true),
('Open to collaboration opportunities. What kind of projects excite you?', 'networking', 'first_message', NULL, 'any', true);

-- Note: 'all' category just aggregates all prompts, no need to insert separately
