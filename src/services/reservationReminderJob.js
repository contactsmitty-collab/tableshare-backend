/**
 * Sends push reminders for upcoming reservations (24h and 1h before).
 * Run periodically (e.g. on startup and every 6 hours) or via cron.
 * Uses reminded_24h_at and reminded_1h_at to avoid duplicate sends.
 */

const db = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

async function runReservationReminders() {
  try {
    await db.query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_24h_at TIMESTAMP WITH TIME ZONE').catch(() => {});
    await db.query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_1h_at TIMESTAMP WITH TIME ZONE').catch(() => {});

    const res24 = await db.query(
      `SELECT r.reservation_id, r.user_id, r.reservation_date, r.reservation_time,
              r.party_size, rest.name as restaurant_name
       FROM reservations r
       JOIN restaurants rest ON rest.restaurant_id = r.restaurant_id
       WHERE r.status IN ('confirmed', 'pending', 'seated')
         AND r.reservation_date >= CURRENT_DATE
         AND (r.reservation_date + r.reservation_time) >= (NOW() + interval '23 hours')
         AND (r.reservation_date + r.reservation_time) <= (NOW() + interval '25 hours')
         AND r.reminded_24h_at IS NULL`
    ).catch(() => ({ rows: [] }));

    for (const row of res24.rows || []) {
      try {
        await notificationService.sendReservationReminder(
          row.user_id, row.restaurant_name, row.reservation_date, row.reservation_time,
          row.reservation_id, 24
        );
        await db.query(
          'UPDATE reservations SET reminded_24h_at = NOW() WHERE reservation_id = $1',
          [row.reservation_id]
        );
      } catch (err) {
        logger.error('Reservation 24h reminder send failed', { reservationId: row.reservation_id, err: err.message });
      }
    }

    const res1h = await db.query(
      `SELECT r.reservation_id, r.user_id, r.reservation_date, r.reservation_time,
              r.party_size, rest.name as restaurant_name
       FROM reservations r
       JOIN restaurants rest ON rest.restaurant_id = r.restaurant_id
       WHERE r.status IN ('confirmed', 'pending', 'seated')
         AND r.reservation_date >= CURRENT_DATE
         AND (r.reservation_date + r.reservation_time) >= (NOW() + interval '55 minutes')
         AND (r.reservation_date + r.reservation_time) <= (NOW() + interval '65 minutes')
         AND r.reminded_1h_at IS NULL`
    ).catch(() => ({ rows: [] }));

    for (const row of res1h.rows || []) {
      try {
        await notificationService.sendReservationReminder(
          row.user_id, row.restaurant_name, row.reservation_date, row.reservation_time,
          row.reservation_id, 1
        );
        await db.query(
          'UPDATE reservations SET reminded_1h_at = NOW() WHERE reservation_id = $1',
          [row.reservation_id]
        );
      } catch (err) {
        logger.error('Reservation 1h reminder send failed', { reservationId: row.reservation_id, err: err.message });
      }
    }

    const count24 = (res24.rows || []).length;
    const count1h = (res1h.rows || []).length;
    if (count24 > 0 || count1h > 0) {
      logger.info(`Reservation reminders sent: 24h=${count24}, 1h=${count1h}`);
    }
    return { reminded24h: count24, reminded1h: count1h };
  } catch (err) {
    logger.error('Reservation reminder job failed', err);
    throw err;
  }
}

module.exports = { runReservationReminders };
