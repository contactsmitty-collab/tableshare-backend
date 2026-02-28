/**
 * Ensures the reservations table exists in the same DB your API uses.
 * Run from backend root with the same env as your server:
 *   cd tableshare-backend && node scripts/ensure-reservations-table.js
 *
 * Uses .env.local (then .env) so it matches server.js and run-migrations.js.
 */
const path = require('path');

// Load env the same way as server: .env.local from repo root
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });

const { pool } = require('../src/config/database');

const SQL = `
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    party_size INTEGER NOT NULL,
    table_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    source VARCHAR(50) DEFAULT 'app',
    external_booking_id VARCHAR(255),
    external_booking_url TEXT,
    special_requests TEXT,
    occasion VARCHAR(100),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    confirmation_code VARCHAR(20),
    notes TEXT,
    rating_after_visit INTEGER CHECK (rating_after_visit >= 1 AND rating_after_visit <= 5)
);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(reservation_date, status);
`;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const dbInfo = dbUrl
    ? dbUrl.replace(/:[^:@]+@/, ':****@').replace(/\?.*$/, '')
    : `postgresql://${process.env.USER || 'postgres'}@localhost:5432/tableshare_dev (default)`;
  console.log('Using DB:', dbInfo);
  console.log('Creating reservations table if not exists...');

  try {
    await pool.query(SQL);
    console.log('Done. reservations table is ready.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
