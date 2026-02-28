-- Migration: Add Event-based Dining Badges
-- Created: 2026-02-18

-- Add event-related columns to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS has_live_music BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_trivia BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_watch_parties BOOLEAN DEFAULT false, -- Sports games
ADD COLUMN IF NOT EXISTS has_happy_hour BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_brunch BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_late_night BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_outdoor_seating BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_private_rooms BOOLEAN DEFAULT false;

-- Create events table for scheduled events
CREATE TABLE IF NOT EXISTS venue_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'sports', 'trivia', 'music', 'special'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(100), -- 'weekly_tuesday', 'daily', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Create event types lookup table
CREATE TABLE IF NOT EXISTS event_types (
    type_id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7) DEFAULT '#FF6B35',
    display_name VARCHAR(100),
    description TEXT
);

-- Insert standard event types
INSERT INTO event_types (name, icon, color, display_name, description) VALUES
    ('sports', 'tv', '#FF4444', 'Watch Party', 'Watch live sports games'),
    ('trivia', 'help-circle', '#9C27B0', 'Trivia Night', 'Test your knowledge'),
    ('music', 'musical-notes', '#2196F3', 'Live Music', 'Live band or DJ'),
    ('happy_hour', 'wine', '#FF9800', 'Happy Hour', 'Drink specials'),
    ('brunch', 'sunny', '#4CAF50', 'Brunch', 'Weekend brunch service'),
    ('late_night', 'moon', '#3F51B5', 'Late Night', 'Open late for food'),
    ('karaoke', 'mic', '#E91E63', 'Karaoke Night', 'Sing your heart out'),
    ('comedy', 'happy', '#FF5722', 'Comedy Night', 'Stand-up comedy show'),
    ('dj', 'radio', '#673AB7', 'DJ Set', 'DJ spinning tracks')
ON CONFLICT (name) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_venue_events_restaurant_id ON venue_events(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_venue_events_time ON venue_events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_venue_events_type ON venue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_live_music ON restaurants(has_live_music) WHERE has_live_music = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_trivia ON restaurants(has_trivia) WHERE has_trivia = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_watch_parties ON restaurants(has_watch_parties) WHERE has_watch_parties = true;

COMMENT ON TABLE venue_events IS 'Scheduled events at venues like trivia nights, watch parties, live music';
COMMENT ON TABLE event_types IS 'Standard event type definitions with icons and colors';
