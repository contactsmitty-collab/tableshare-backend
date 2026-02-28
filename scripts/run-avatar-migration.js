#!/usr/bin/env node
/**
 * AI Companion Avatar addendum migration — standalone (no external SQL file).
 * Copy this into tableshare-backend/scripts/ and add to package.json:
 *   "migrate:avatar": "node scripts/run-avatar-migration-standalone.js"
 * Requires: DATABASE_URL in .env, and ai_companion_preferences table already created.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in .env or pass it as an env var.');
  process.exit(1);
}

const SQL = `
ALTER TABLE ai_companion_preferences
  ADD COLUMN IF NOT EXISTS avatar_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS selected_avatar_id VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tts_voice_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN NOT NULL DEFAULT TRUE;

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

INSERT INTO ai_avatars (avatar_id, display_name, personality_type, personality_blurb, portrait_url, thumbnail_url, sort_order)
VALUES
  ('ava', 'Ava', 'friendly', 'Warm and curious, loves hearing about your day.', 'https://placehold.co/512x512/eee/999?text=Ava', 'https://placehold.co/180x180/eee/999?text=Ava', 1),
  ('leo', 'Leo', 'witty', 'Quick-witted with a dry sense of humor.', 'https://placehold.co/512x512/eee/999?text=Leo', 'https://placehold.co/180x180/eee/999?text=Leo', 2),
  ('sam', 'Sam', 'intellectual', 'Thoughtful, always has an interesting take.', 'https://placehold.co/512x512/eee/999?text=Sam', 'https://placehold.co/180x180/eee/999?text=Sam', 3),
  ('kai', 'Kai', 'chill', 'Easy-going, great at comfortable silences.', 'https://placehold.co/512x512/eee/999?text=Kai', 'https://placehold.co/180x180/eee/999?text=Kai', 4),
  ('mia', 'Mia', 'friendly', 'Makes everyone feel like an old friend.', 'https://placehold.co/512x512/eee/999?text=Mia', 'https://placehold.co/180x180/eee/999?text=Mia', 5),
  ('ren', 'Ren', 'witty', 'Will make you laugh before the appetizers arrive.', 'https://placehold.co/512x512/eee/999?text=Ren', 'https://placehold.co/180x180/eee/999?text=Ren', 6),
  ('nia', 'Nia', 'intellectual', 'Could talk food history for hours.', 'https://placehold.co/512x512/eee/999?text=Nia', 'https://placehold.co/180x180/eee/999?text=Nia', 7),
  ('dev', 'Dev', 'chill', 'Calm energy, zero pressure.', 'https://placehold.co/512x512/eee/999?text=Dev', 'https://placehold.co/180x180/eee/999?text=Dev', 8),
  ('jay', 'Jay', 'friendly', 'Naturally upbeat, always finds the bright side.', 'https://placehold.co/512x512/eee/999?text=Jay', 'https://placehold.co/180x180/eee/999?text=Jay', 9),
  ('zara', 'Zara', 'witty', 'Sharp, charming, and never boring.', 'https://placehold.co/512x512/eee/999?text=Zara', 'https://placehold.co/180x180/eee/999?text=Zara', 10),
  ('ellis', 'Ellis', 'intellectual', 'Connects dots you didn''t know existed.', 'https://placehold.co/512x512/eee/999?text=Ellis', 'https://placehold.co/180x180/eee/999?text=Ellis', 11),
  ('teo', 'Teo', 'chill', 'Like dining with your most relaxed friend.', 'https://placehold.co/512x512/eee/999?text=Teo', 'https://placehold.co/180x180/eee/999?text=Teo', 12)
ON CONFLICT (avatar_id) DO NOTHING;
`;

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query(SQL);
    console.log('Avatar migration completed successfully.');
  } catch (err) {
    console.error('Avatar migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
