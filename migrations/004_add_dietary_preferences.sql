-- Migration: Add Dietary Preference Filters
-- Created: 2026-02-18

-- Add dietary columns to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS has_vegan_options BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_vegetarian_options BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_gluten_free BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_halal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_kosher BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_dairy_free BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_nut_free BOOLEAN DEFAULT false;

-- Create dietary tags table for many-to-many relationship (optional advanced feature)
CREATE TABLE IF NOT EXISTS dietary_tags (
    tag_id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7) DEFAULT '#4CAF50',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert standard dietary tags
INSERT INTO dietary_tags (name, icon, color) VALUES
    ('Vegan', 'leaf', '#4CAF50'),
    ('Vegetarian', 'egg', '#8BC34A'),
    ('Gluten-Free', 'wheat-off', '#FF9800'),
    ('Halal', 'moon', '#2196F3'),
    ('Kosher', 'star', '#9C27B0'),
    ('Dairy-Free', 'milk-off', '#03A9F4'),
    ('Nut-Free', 'peanut-off', '#795548')
ON CONFLICT (name) DO NOTHING;

-- Create restaurant_dietary_tags junction table
CREATE TABLE IF NOT EXISTS restaurant_dietary_tags (
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES dietary_tags(tag_id) ON DELETE CASCADE,
    verified BOOLEAN DEFAULT false,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    added_by UUID REFERENCES users(user_id),
    PRIMARY KEY (restaurant_id, tag_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_dietary_restaurant_id ON restaurant_dietary_tags(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_dietary_tag_id ON restaurant_dietary_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_vegan ON restaurants(has_vegan_options) WHERE has_vegan_options = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_gluten_free ON restaurants(has_gluten_free) WHERE has_gluten_free = true;

COMMENT ON TABLE dietary_tags IS 'Standardized dietary preference tags';
COMMENT ON TABLE restaurant_dietary_tags IS 'Links restaurants to their dietary options';
