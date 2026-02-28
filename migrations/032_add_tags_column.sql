-- Add tags array column to restaurants for category-based discovery
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_restaurants_tags ON restaurants USING GIN (tags);
