-- Track whether we've sent the 24h reminder for a group event (avoid duplicate pushes)
ALTER TABLE group_events
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;
