-- Migration: Add venue_type column to restaurants
-- Created: 2026-02-18

-- Add venue_type column
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50) DEFAULT 'restaurant';

-- Update existing bars/nightclubs based on name patterns or other criteria
-- First, let's set some common patterns
UPDATE restaurants SET venue_type = 'bar' 
WHERE name ILIKE '%bar%' 
   OR name ILIKE '%pub%' 
   OR name ILIKE '%tavern%'
   OR cuisine_type ILIKE '%bar%';

UPDATE restaurants SET venue_type = 'nightclub' 
WHERE name ILIKE '%club%'
   OR name ILIKE '%lounge%'
   OR name ILIKE '%dance%';

-- Set remaining nulls to 'restaurant'
UPDATE restaurants SET venue_type = 'restaurant' WHERE venue_type IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_restaurants_venue_type ON restaurants(venue_type);

COMMENT ON COLUMN restaurants.venue_type IS 'Type of venue: restaurant, bar, nightclub, rooftop_bar, speakeasy, lounge';
