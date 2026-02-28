-- Track when we sent 24h and 1h reservation reminders (for reminder job)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_24h_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_1h_at TIMESTAMP WITH TIME ZONE;
