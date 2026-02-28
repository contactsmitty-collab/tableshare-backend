/**
 * Run reservation reminder job (24h and 1h before). For cron:
 *   cd tableshare-backend && node scripts/run-reservation-reminders.js
 */
const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });

const { runReservationReminders } = require('../src/services/reservationReminderJob');
const { pool } = require('../src/config/database');

async function main() {
  try {
    const result = await runReservationReminders();
    console.log('Done. 24h reminders:', result.reminded24h, '| 1h reminders:', result.reminded1h);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
