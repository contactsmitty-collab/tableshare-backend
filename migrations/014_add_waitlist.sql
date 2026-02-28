-- Migration: Add Virtual Queue/Waitlist System
-- Created: 2026-02-18

-- Create waitlist_entries table
CREATE TABLE IF NOT EXISTS waitlist_entries (
    waitlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Party details
    party_size INTEGER NOT NULL,
    party_name VARCHAR(255), -- "Smith Family", "John's Group"

    -- Waitlist status
    status VARCHAR(50) DEFAULT 'waiting', -- 'waiting', 'notified', 'seated', 'cancelled', 'no_show'
    queue_position INTEGER,

    -- Preferences
    table_type_preference VARCHAR(50), -- 'bar', 'table', 'booth', 'patio', 'any'
    seating_preference TEXT[], -- ['quiet', 'window', 'near_bar']
    special_requests TEXT,

    -- Contact info for notifications
    phone_number VARCHAR(50),
    notification_method VARCHAR(50) DEFAULT 'push', -- 'push', 'sms', 'email'

    -- Time tracking
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    estimated_seating_time TIMESTAMP WITH TIME ZONE,
    notified_at TIMESTAMP WITH TIME ZONE,
    seated_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Quote times (in minutes)
    quoted_wait_time INTEGER, -- Initial quoted wait
    actual_wait_time INTEGER, -- Calculated after seating

    -- Metadata
    notes TEXT,
    cancellation_reason VARCHAR(100), -- 'left_venue', 'found_table', 'too_long', 'other'

    -- Unique constraint - one active waitlist per user per restaurant
    CONSTRAINT unique_active_waitlist UNIQUE (restaurant_id, user_id, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_restaurant_id ON waitlist_entries(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_user_id ON waitlist_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_entries(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_waiting ON waitlist_entries(restaurant_id, status) WHERE status IN ('waiting', 'notified');
CREATE INDEX IF NOT EXISTS idx_waitlist_joined_at ON waitlist_entries(joined_at);

-- Create function to calculate queue position
CREATE OR REPLACE FUNCTION calculate_queue_position(p_restaurant_id UUID, p_waitlist_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_position INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM waitlist_entries
    WHERE restaurant_id = p_restaurant_id
    AND status = 'waiting'
    AND joined_at < (SELECT joined_at FROM waitlist_entries WHERE waitlist_id = p_waitlist_id);

    RETURN v_position;
END;
$$ LANGUAGE plpgsql;

-- Create function to get estimated wait time based on queue position
-- Second param is BIGINT so COUNT() in views can be passed without cast
CREATE OR REPLACE FUNCTION estimate_wait_time(p_restaurant_id UUID, p_position BIGINT)
RETURNS INTEGER AS $$
DECLARE
    v_avg_seating_time INTEGER := 15; -- Average minutes per table
    v_pos INTEGER := LEAST(GREATEST(p_position::INTEGER, 0), 999);
BEGIN
    -- Base calculation: position * average seating time
    RETURN LEAST(v_pos * v_avg_seating_time + (RANDOM() * 10)::INTEGER, 180); -- Cap at 3 hours
END;
$$ LANGUAGE plpgsql;

-- Drop views first so they are recreated after functions exist (avoids "function does not exist" on re-run)
DROP VIEW IF EXISTS waitlist_stats;
DROP VIEW IF EXISTS active_waitlist;

-- Create view for active waitlist with details
CREATE OR REPLACE VIEW active_waitlist AS
SELECT
    w.*,
    r.name as restaurant_name,
    r.address as restaurant_address,
    r.phone as restaurant_phone,
    r.photo_url as restaurant_photo,
    u.username,
    u.first_name,
    u.last_name,
    u.phone as user_phone,
    calculate_queue_position(w.restaurant_id, w.waitlist_id) as calculated_position,
    estimate_wait_time(w.restaurant_id, calculate_queue_position(w.restaurant_id, w.waitlist_id)) as estimated_minutes_remaining
FROM waitlist_entries w
JOIN restaurants r ON w.restaurant_id = r.restaurant_id
JOIN users u ON w.user_id = u.user_id
WHERE w.status IN ('waiting', 'notified');

-- Create view for waitlist statistics per restaurant
CREATE OR REPLACE VIEW waitlist_stats AS
SELECT
    restaurant_id,
    COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
    COUNT(*) FILTER (WHERE status = 'notified') as notified_count,
    AVG(party_size) FILTER (WHERE status = 'waiting') as avg_party_size,
    MAX(joined_at) as oldest_entry,
    estimate_wait_time(restaurant_id, COUNT(*) FILTER (WHERE status = 'waiting')) as estimated_longest_wait
FROM waitlist_entries
WHERE status IN ('waiting', 'notified')
GROUP BY restaurant_id;

-- Add waitlist-related columns to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS has_waitlist BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS waitlist_max_party_size INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS waitlist_notes TEXT, -- "Join our waitlist on busy nights!"
ADD COLUMN IF NOT EXISTS avg_turn_time_minutes INTEGER DEFAULT 60; -- Average table turn time

-- Create function to notify user when table ready (simulated)
CREATE OR REPLACE FUNCTION notify_waitlist_user(p_waitlist_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE waitlist_entries
    SET status = 'notified',
        notified_at = NOW()
    WHERE waitlist_id = p_waitlist_id
    AND status = 'waiting';
END;
$$ LANGUAGE plpgsql;

-- Create function to mark as seated
CREATE OR REPLACE FUNCTION mark_waitlist_seated(p_waitlist_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE waitlist_entries
    SET status = 'seated',
        seated_at = NOW(),
        actual_wait_time = EXTRACT(EPOCH FROM (NOW() - joined_at)) / 60
    WHERE waitlist_id = p_waitlist_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-cancel old waitlist entries (after 4 hours)
CREATE OR REPLACE FUNCTION expire_old_waitlist_entries()
RETURNS void AS $$
BEGIN
    UPDATE waitlist_entries
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = 'expired'
    WHERE status IN ('waiting', 'notified')
    AND joined_at < NOW() - INTERVAL '4 hours';
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE waitlist_entries IS 'Virtual queue/waitlist for walk-in guests';
COMMENT ON COLUMN waitlist_entries.status IS 'Current status in queue: waiting, notified, seated, cancelled';
COMMENT ON COLUMN waitlist_entries.queue_position IS 'Position in queue (1 = next to be seated)';
