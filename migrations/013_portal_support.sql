-- Portal support: add columns needed for admin/restaurant dashboards

-- User role and restaurant association
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_restaurant_id ON users(restaurant_id);

-- Extended restaurant fields for profile editing
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS hours TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS photo_url TEXT;
