-- AI Companion: avatars catalog for avatar mode (041)
CREATE TABLE IF NOT EXISTS ai_avatars (
  avatar_id VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  personality_type VARCHAR(20) NOT NULL CHECK (personality_type IN ('friendly', 'witty', 'intellectual', 'chill')),
  personality_blurb TEXT NOT NULL,
  portrait_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  idle_animation_url TEXT,
  mouth_sprites_url TEXT,
  expression_variants JSONB DEFAULT '{}',
  video_presenter_id VARCHAR(100),
  idle_video_url TEXT,
  tts_voice_id VARCHAR(100),
  tts_voice_name VARCHAR(50),
  gender_presentation VARCHAR(20),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Portrait images: Unsplash CDN (w/h/fit=crop/crop=faces). Replace with Cloudinary URLs when you upload your own.
-- Thumbnail = 180x180, portrait = 512x512. To use Cloudinary: UPDATE ai_avatars SET thumbnail_url = 'https://res.cloudinary.com/YOUR_CLOUD/...', portrait_url = '...' WHERE avatar_id = 'ava'; etc.
INSERT INTO ai_avatars (avatar_id, display_name, personality_type, personality_blurb, portrait_url, thumbnail_url, sort_order)
VALUES
  ('ava', 'Ava', 'friendly', 'Warm and curious, loves hearing about your day.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=180&h=180&fit=crop&crop=faces', 1),
  ('leo', 'Leo', 'witty', 'Quick-witted with a dry sense of humor.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=180&h=180&fit=crop&crop=faces', 2),
  ('sam', 'Sam', 'intellectual', 'Thoughtful, always has an interesting take.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=180&h=180&fit=crop&crop=faces', 3),
  ('kai', 'Kai', 'chill', 'Easy-going, great at comfortable silences.', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=180&h=180&fit=crop&crop=faces', 4),
  ('mia', 'Mia', 'friendly', 'Makes everyone feel like an old friend.', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=180&h=180&fit=crop&crop=faces', 5),
  ('ren', 'Ren', 'witty', 'Will make you laugh before the appetizers arrive.', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=180&h=180&fit=crop&crop=faces', 6),
  ('nia', 'Nia', 'intellectual', 'Could talk food history for hours.', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=180&h=180&fit=crop&crop=faces', 7),
  ('dev', 'Dev', 'chill', 'Calm energy, zero pressure.', 'https://images.unsplash.com/photo-1502685104226-ee32353b4d4e?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1502685104226-ee32353b4d4e?w=180&h=180&fit=crop&crop=faces', 8),
  ('jay', 'Jay', 'friendly', 'Naturally upbeat, always finds the bright side.', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=180&h=180&fit=crop&crop=faces', 9),
  ('zara', 'Zara', 'witty', 'Sharp, charming, and never boring.', 'https://images.unsplash.com/photo-1531123897727-8f129e16824e?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1531123897727-8f129e16824e?w=180&h=180&fit=crop&crop=faces', 10),
  ('ellis', 'Ellis', 'intellectual', 'Connects dots you didn''t know existed.', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=180&h=180&fit=crop&crop=faces', 11),
  ('teo', 'Teo', 'chill', 'Like dining with your most relaxed friend.', 'https://images.unsplash.com/photo-1507591064344-4c6ce5b2289f?w=512&h=512&fit=crop&crop=faces', 'https://images.unsplash.com/photo-1507591064344-4c6ce5b2289f?w=180&h=180&fit=crop&crop=faces', 12)
ON CONFLICT (avatar_id) DO NOTHING;
