-- Add reservation-related columns to restaurants if missing (fixes 500 when column does not exist)
-- Safe to run multiple times (IF NOT EXISTS / no-op if column exists)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS accepts_reservations BOOLEAN DEFAULT true;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_provider VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_provider_id VARCHAR(255);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_phone VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_lead_time_hours INTEGER DEFAULT 2;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_party_size INTEGER DEFAULT 10;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS min_party_size INTEGER DEFAULT 1;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_duration_minutes INTEGER DEFAULT 120;
