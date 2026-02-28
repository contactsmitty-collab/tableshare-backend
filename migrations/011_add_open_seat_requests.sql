-- Migration: Add Join a Table / Open Seat Requests System
-- Created: 2026-02-18

-- Create open_seats table - when a user checks in and has extra seats
CREATE TABLE IF NOT EXISTS open_seats (
    open_seat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    host_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    check_in_id UUID REFERENCES check_ins(check_in_id) ON DELETE CASCADE,

    -- Seat details
    available_seats INTEGER NOT NULL DEFAULT 1,
    total_seats_at_table INTEGER,
    seat_type VARCHAR(50) DEFAULT 'any', -- 'bar', 'table', 'booth', 'patio', 'any'

    -- Preferences for who can join
    looking_for VARCHAR(100), -- 'anyone', 'women', 'men', 'mixed_group', 'singles', 'couples'
    age_preference_min INTEGER,
    age_preference_max INTEGER,
    vibe_tags TEXT[], -- ['casual', 'celebrating', 'networking', 'date_night', 'friends_night_out']

    -- Time and status
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'pending', 'filled', 'cancelled', 'expired'
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When the offer expires

    -- Context
    occasion VARCHAR(100),
    notes TEXT, -- "Celebrating a birthday!", "Come watch the game with us"

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Location for finding nearby
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_open_seats_restaurant_id ON open_seats(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_open_seats_host_user_id ON open_seats(host_user_id);
CREATE INDEX IF NOT EXISTS idx_open_seats_status ON open_seats(status);
CREATE INDEX IF NOT EXISTS idx_open_seats_expires ON open_seats(expires_at);
CREATE INDEX IF NOT EXISTS idx_open_seats_status_expires ON open_seats(status, expires_at) WHERE status = 'open';

-- Create seat_requests table - when someone wants to join
CREATE TABLE IF NOT EXISTS seat_requests (
    seat_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    open_seat_id UUID NOT NULL REFERENCES open_seats(open_seat_id) ON DELETE CASCADE,
    requester_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Request details
    message TEXT, -- "Love to join!", "Big basketball fan too"
    party_size INTEGER DEFAULT 1,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'declined', 'cancelled', 'expired'
    response_message TEXT, -- Host's response

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Unique constraint - one pending request per user per open seat
    UNIQUE (open_seat_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_requests_open_seat_id ON seat_requests(open_seat_id);
CREATE INDEX IF NOT EXISTS idx_seat_requests_requester_user_id ON seat_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_seat_requests_status ON seat_requests(status);

-- Create view for open seats with restaurant and host info
-- Drop first so we can change column names (Postgres forbids renaming via CREATE OR REPLACE)
DROP VIEW IF EXISTS seat_requests_with_details;
DROP VIEW IF EXISTS open_seats_with_details;
CREATE OR REPLACE VIEW open_seats_with_details AS
SELECT
    os.*,
    r.name as restaurant_name,
    r.address as restaurant_address,
    r.photo_url as restaurant_photo,
    u.username as host_username,
    u.first_name as host_first_name,
    u.last_name as host_last_name,
    u.avatar_url as host_avatar_url,
    u.age as host_age,
    u.bio as host_bio,
    (SELECT COUNT(*) FROM seat_requests sr WHERE sr.open_seat_id = os.open_seat_id AND sr.status = 'pending') as pending_request_count
FROM open_seats os
JOIN restaurants r ON os.restaurant_id = r.restaurant_id
JOIN users u ON os.host_user_id = u.user_id
WHERE os.status = 'open' AND os.expires_at > NOW();

-- Create view for seat requests with all details
CREATE OR REPLACE VIEW seat_requests_with_details AS
SELECT
    sr.*,
    os.restaurant_id,
    os.available_seats,
    os.notes as host_notes,
    os.occasion,
    r.name as restaurant_name,
    r.photo_url as restaurant_photo,
    hu.username as host_username,
    hu.first_name as host_first_name,
    hu.avatar_url as host_avatar_url,
    ru.username as requester_username,
    ru.first_name as requester_first_name,
    ru.avatar_url as requester_avatar_url,
    ru.age as requester_age,
    ru.bio as requester_bio
FROM seat_requests sr
JOIN open_seats os ON sr.open_seat_id = os.open_seat_id
JOIN restaurants r ON os.restaurant_id = r.restaurant_id
JOIN users hu ON os.host_user_id = hu.user_id
JOIN users ru ON sr.requester_user_id = ru.user_id;

-- Function to automatically expire old open seats
CREATE OR REPLACE FUNCTION expire_old_open_seats()
RETURNS void AS $$
BEGIN
    UPDATE open_seats
    SET status = 'expired'
    WHERE status = 'open' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE open_seats IS 'Active offers from checked-in users to share table seats';
COMMENT ON TABLE seat_requests IS 'Requests from users to join open seats';
COMMENT ON COLUMN open_seats.vibe_tags IS 'Tags describing the vibe/atmosphere at the table';
COMMENT ON COLUMN open_seats.looking_for IS 'Type of people the host wants to join';
