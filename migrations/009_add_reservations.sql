-- Migration: Add Table Reservations System
-- Created: 2026-02-18

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Reservation details
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    party_size INTEGER NOT NULL,
    table_type VARCHAR(50), -- 'standard', 'bar', 'outdoor', 'private'
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
    
    -- Source of booking
    source VARCHAR(50) DEFAULT 'app', -- 'app', 'resy', 'opentable', 'phone', 'walkin'
    external_booking_id VARCHAR(255), -- ID from Resy/OpenTable if applicable
    external_booking_url TEXT, -- Deep link to modify/cancel
    
    -- Special requests
    special_requests TEXT,
    occasion VARCHAR(100), -- 'birthday', 'anniversary', 'business', 'date', etc.
    
    -- Guest info
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    confirmation_code VARCHAR(20),
    notes TEXT,
    rating_after_visit INTEGER CHECK (rating_after_visit >= 1 AND rating_after_visit <= 5)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(reservation_date, status);

-- Create reservation slots table (for restaurant capacity management)
CREATE TABLE IF NOT EXISTS reservation_slots (
    slot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    party_size_min INTEGER NOT NULL DEFAULT 1,
    party_size_max INTEGER NOT NULL DEFAULT 4,
    available_tables INTEGER NOT NULL DEFAULT 0,
    total_tables INTEGER NOT NULL DEFAULT 0,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (restaurant_id, slot_date, slot_time, party_size_min, party_size_max)
);

CREATE INDEX IF NOT EXISTS idx_reservation_slots_restaurant ON reservation_slots(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservation_slots_date ON reservation_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_reservation_slots_available ON reservation_slots(is_available, slot_date, slot_time);

-- Add reservation-related columns to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS accepts_reservations BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reservation_provider VARCHAR(50), -- 'internal', 'resy', 'opentable', 'yelp', 'tock'
ADD COLUMN IF NOT EXISTS reservation_provider_id VARCHAR(255), -- Venue ID in external system
ADD COLUMN IF NOT EXISTS reservation_url TEXT, -- Direct booking URL
ADD COLUMN IF NOT EXISTS reservation_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS reservation_lead_time_hours INTEGER DEFAULT 2, -- Minimum hours ahead required
ADD COLUMN IF NOT EXISTS max_party_size INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS min_party_size INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS reservation_duration_minutes INTEGER DEFAULT 120; -- Default 2 hour slots

-- Create view for upcoming reservations with restaurant info
CREATE OR REPLACE VIEW upcoming_reservations AS
SELECT 
    r.reservation_id,
    r.restaurant_id,
    r.user_id,
    r.reservation_date,
    r.reservation_time,
    r.party_size,
    r.status,
    r.source,
    r.special_requests,
    r.occasion,
    r.confirmation_code,
    r.created_at,
    rest.name as restaurant_name,
    rest.address as restaurant_address,
    rest.photo_url as restaurant_photo,
    rest.reservation_phone as restaurant_phone
FROM reservations r
JOIN restaurants rest ON r.restaurant_id = rest.restaurant_id
WHERE r.status IN ('pending', 'confirmed', 'seated')
AND r.reservation_date >= CURRENT_DATE;

-- Add comments
COMMENT ON TABLE reservations IS 'Table reservations made through the app or linked external providers';
COMMENT ON TABLE reservation_slots IS 'Available reservation time slots for restaurants';
COMMENT ON COLUMN reservations.source IS 'Where the booking originated: app, resy, opentable, etc.';
COMMENT ON COLUMN restaurants.reservation_provider IS 'Which system handles bookings: internal, resy, opentable, etc.';
