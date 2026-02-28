/**
 * Ensures reservation slots exist for the next 14 days for all restaurants
 * that accept reservations. Run from cron or manually:
 *   cd tableshare-backend && node scripts/ensure-reservation-slots.js
 *
 * Uses .env.local (then .env) so it matches the API server.
 */
const path = require('path');

const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });

const { ensureReservationSlots } = require('../src/services/reservationSlotService');
const { pool } = require('../src/config/database');

async function main() {
  const daysAhead = parseInt(process.env.RESERVATION_SLOT_DAYS || '14', 10) || 14;
  const dbUrl = process.env.DATABASE_URL;
  const dbInfo = dbUrl
    ? dbUrl.replace(/:[^:@]+@/, ':****@').replace(/\?.*$/, '')
    : `postgresql://${process.env.USER || 'postgres'}@localhost:5432/tableshare_dev (default)`;
  console.log('Using DB:', dbInfo);
  console.log('Ensuring reservation slots for next', daysAhead, 'days...');

  try {
    const { restaurants, slotsInserted } = await ensureReservationSlots(daysAhead);
    console.log('Done. Restaurants:', restaurants, '| New slots inserted:', slotsInserted);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
