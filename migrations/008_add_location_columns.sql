-- Migration: Add location and photo columns to restaurants
-- Created: 2026-02-18

-- Add location columns
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- Create indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);

COMMENT ON COLUMN restaurants.latitude IS 'Latitude for map location';
COMMENT ON COLUMN restaurants.longitude IS 'Longitude for map location';
COMMENT ON COLUMN restaurants.photo_url IS 'Main photo URL for the restaurant';
COMMENT ON COLUMN restaurants.thumbnail IS 'Thumbnail image URL for cards';
