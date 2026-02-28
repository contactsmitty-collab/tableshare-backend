-- Migration: Add Table Availability & Wait Times Feature
-- Created: 2026-02-18

-- Create table_availability table
CREATE TABLE IF NOT EXISTS table_availability (
    id SERIAL PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    available_tables INTEGER,
    wait_time_minutes INTEGER,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(user_id),
    UNIQUE (restaurant_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_table_availability_restaurant_id ON table_availability(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_availability_updated_at ON table_availability(updated_at);

-- Add columns to restaurants table for static availability info
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS accepts_reservations BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reservation_provider VARCHAR(50), -- 'resy', 'opentable', 'yelp', etc.
ADD COLUMN IF NOT EXISTS reservation_url TEXT,
ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- Add availability-related columns
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS has_waitlist BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS typical_wait_time INTEGER; -- in minutes

COMMENT ON TABLE table_availability IS 'Real-time table availability and wait times for restaurants';
COMMENT ON COLUMN table_availability.available_tables IS 'Number of tables currently available';
COMMENT ON COLUMN table_availability.wait_time_minutes IS 'Estimated wait time in minutes if no tables available';
