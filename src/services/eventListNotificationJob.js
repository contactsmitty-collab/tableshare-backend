/**
 * Sends push notifications when a restaurant on the user's list has an upcoming event.
 * Run daily (e.g. on startup and every 24h). Uses event_list_notification_sent to avoid duplicate sends.
 */

const db = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

async function runEventListNotifications() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_list_notification_sent (
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES venue_events(event_id) ON DELETE CASCADE,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (user_id, event_id)
      )
    `).catch(() => {});

    const rows = await db.query(
      `SELECT DISTINCT l.user_id, e.event_id, e.title AS event_title, e.start_time, r.restaurant_id, r.name AS restaurant_name
       FROM dining_list_entries dle
       JOIN dining_lists l ON l.list_id = dle.list_id
       JOIN venue_events e ON e.restaurant_id = dle.restaurant_id AND e.is_active = true
       JOIN restaurants r ON r.restaurant_id = dle.restaurant_id
       WHERE e.start_time >= NOW() AND e.start_time <= (NOW() + interval '24 hours')
         AND NOT EXISTS (
           SELECT 1 FROM event_list_notification_sent s
           WHERE s.user_id = l.user_id AND s.event_id = e.event_id
         )
       ORDER BY l.user_id, e.start_time`
    ).catch(() => ({ rows: [] }));

    let sent = 0;
    for (const row of rows.rows || []) {
      try {
        const ok = await notificationService.sendEventAtListNotification(
          row.user_id,
          row.restaurant_name,
          row.event_title,
          row.restaurant_id
        );
        if (ok) {
          await db.query(
            'INSERT INTO event_list_notification_sent (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING',
            [row.user_id, row.event_id]
          );
          sent++;
        }
      } catch (err) {
        logger.error('Event list notification send failed', { userId: row.user_id, eventId: row.event_id, err: err.message });
      }
    }
    if (sent > 0) {
      logger.info(`Event-at-list notifications sent: ${sent}`);
    }
    return { sent };
  } catch (err) {
    logger.error('Event list notification job failed', err);
    throw err;
  }
}

module.exports = { runEventListNotifications };
