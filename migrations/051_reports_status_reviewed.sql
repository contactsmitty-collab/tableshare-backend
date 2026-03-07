-- Add status and reviewed_at to reports for admin queue
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

COMMENT ON COLUMN reports.status IS 'pending, reviewed, dismissed';
COMMENT ON COLUMN reports.reviewed_at IS 'When admin marked as reviewed';
