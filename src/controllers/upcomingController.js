const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /users/me/upcoming — reservations (upcoming) + dinner invites (pending) + table alerts (with dates)
const getUpcoming = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [reservationsResult, invitationsResult, alertsResult, groupEventsResult] = await Promise.all([
    query(
      `SELECT r.reservation_id, r.restaurant_id, r.reservation_date, r.reservation_time, r.party_size, r.status,
              r.group_id, dg.group_name as group_name, rest.name as restaurant_name
       FROM reservations r
       JOIN restaurants rest ON r.restaurant_id = rest.restaurant_id
       LEFT JOIN dining_groups dg ON r.group_id = dg.group_id
       WHERE r.user_id = $1 AND r.reservation_date >= CURRENT_DATE AND r.status IN ('pending', 'confirmed', 'seated')
       ORDER BY r.reservation_date ASC, r.reservation_time ASC
       LIMIT 50`,
      [userId]
    ),
    query(
      `SELECT i.invitation_id, i.restaurant_id, i.proposed_date, i.proposed_time, i.status,
              r.name as restaurant_name
       FROM dinner_invitations i
       JOIN restaurants r ON i.restaurant_id = r.restaurant_id
       WHERE (i.initiator_id = $1 OR i.companion_id = $1) AND i.status = 'pending'
         AND i.proposed_date >= CURRENT_DATE
       ORDER BY i.proposed_date ASC
       LIMIT 50`,
      [userId]
    ),
    query(
      `SELECT a.alert_id, a.restaurant_id, a.start_date, a.end_date, a.time_preference,
              COALESCE(r.name, 'Restaurant') as restaurant_name
       FROM table_alerts a
       LEFT JOIN restaurants r ON a.restaurant_id = r.restaurant_id
       WHERE a.user_id = $1 AND a.end_date >= CURRENT_DATE
       ORDER BY a.start_date ASC
       LIMIT 50`,
      [userId]
    ),
    query(
      `SELECT ge.event_id, ge.group_id, ge.restaurant_id, ge.proposed_date, ge.proposed_time, ge.title,
              dg.group_name, r.name as restaurant_name
       FROM group_events ge
       JOIN dining_groups dg ON ge.group_id = dg.group_id
       JOIN restaurants r ON ge.restaurant_id = r.restaurant_id
       JOIN group_members gm ON gm.group_id = ge.group_id AND gm.user_id = $1
       WHERE ge.proposed_date >= CURRENT_DATE AND ge.status = 'scheduled'
       ORDER BY ge.proposed_date ASC, ge.proposed_time ASC NULLS LAST
       LIMIT 50`,
      [userId]
    ),
  ]);

  const items = [];

  reservationsResult.rows.forEach((row) => {
    items.push({
      type: 'reservation',
      sort_date: row.reservation_date,
      reservation_id: row.reservation_id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      date: row.reservation_date,
      time: row.reservation_time,
      party_size: row.party_size,
      status: row.status,
      group_id: row.group_id || null,
      group_name: row.group_name || null,
    });
  });

  invitationsResult.rows.forEach((row) => {
    items.push({
      type: 'dinner_invitation',
      sort_date: row.proposed_date,
      invitation_id: row.invitation_id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      date: row.proposed_date,
      time: row.proposed_time,
      status: row.status,
    });
  });

  alertsResult.rows.forEach((row) => {
    items.push({
      type: 'table_alert',
      sort_date: row.start_date,
      alert_id: row.alert_id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      start_date: row.start_date,
      end_date: row.end_date,
      time_preference: row.time_preference,
    });
  });

  if (groupEventsResult && groupEventsResult.rows) {
    groupEventsResult.rows.forEach((row) => {
      items.push({
        type: 'group_event',
        sort_date: row.proposed_date,
        event_id: row.event_id,
        group_id: row.group_id,
        group_name: row.group_name,
        restaurant_id: row.restaurant_id,
        restaurant_name: row.restaurant_name,
        date: row.proposed_date,
        time: row.proposed_time,
        title: row.title,
      });
    });
  }

  items.sort((a, b) => (a.sort_date < b.sort_date ? -1 : a.sort_date > b.sort_date ? 1 : 0));

  res.json({ upcoming: items });
});

module.exports = { getUpcoming };
