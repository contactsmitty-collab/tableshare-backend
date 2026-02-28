-- Chicago pilot: neighborhood, matching radius, market for profile and segmentation
-- Run after 030; safe to run multiple times (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS matching_radius_miles DECIMAL(3, 1) DEFAULT 1.5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS market VARCHAR(50);

COMMENT ON COLUMN users.neighborhood IS 'Chicago neighborhood (e.g. West Loop / Fulton Market) for Near You and segmentation';
COMMENT ON COLUMN users.matching_radius_miles IS 'Matching radius in miles (1.5–5) for geo-fence';
COMMENT ON COLUMN users.market IS 'Market/city segment (e.g. chicago) for push and analytics';
