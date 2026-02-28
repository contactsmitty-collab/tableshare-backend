-- Migration: Create check_ins table (missing from database)
-- Created: 2026-02-18

-- Create check_ins table for user check-ins at restaurants
CREATE TABLE IF NOT EXISTS check_ins (
    check_in_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Check-in details
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    check_out_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'checked_out', 'auto_checked_out'

    -- Location data (optional, for verification)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_accuracy DECIMAL(8, 2),

    -- Photo from check-in
    photo_url TEXT,
    thumbnail_url TEXT,

    -- Social features
    is_visible BOOLEAN DEFAULT true, -- Whether user appears in "people here" list
    looking_for_company BOOLEAN DEFAULT false, -- Whether user is open to meeting others

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If check_ins was created by 004_checkins.sql it has is_active but not status; add status and backfill
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
UPDATE check_ins SET status = CASE WHEN is_active = true THEN 'active' ELSE 'checked_out' END WHERE status IS NULL AND is_active IS NOT NULL;

-- Indexes that don't depend on status (safe even if status not added yet)
CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant_id ON check_ins(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);

-- Indexes that use status (run in block so we only create if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status);
    CREATE INDEX IF NOT EXISTS idx_check_ins_active ON check_ins(restaurant_id, status) WHERE status = 'active';
  END IF;
END $$;

-- Create view for active check-ins (only if status column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'status') THEN
    DROP VIEW IF EXISTS active_check_ins;
    EXECUTE 'CREATE VIEW active_check_ins AS
      SELECT ci.*, u.username, u.first_name, u.last_name, u.avatar_url, u.age, u.bio,
             r.name as restaurant_name, r.photo_url as restaurant_photo
      FROM check_ins ci
      JOIN users u ON ci.user_id = u.user_id
      JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
      WHERE ci.status = ''active''';
  END IF;
END $$;

-- Function to auto-checkout users after 4 hours
CREATE OR REPLACE FUNCTION auto_checkout_old_checkins()
RETURNS void AS $$
BEGIN
    UPDATE check_ins
    SET status = 'auto_checked_out',
        check_out_time = NOW(),
        updated_at = NOW()
    WHERE status = 'active'
    AND check_in_time < NOW() - INTERVAL '4 hours';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE check_ins IS 'User check-ins at restaurants for social discovery';
