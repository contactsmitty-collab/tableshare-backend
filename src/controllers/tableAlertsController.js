const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// List my alerts
const getMyAlerts = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT a.alert_id, a.restaurant_id, a.start_date, a.end_date, a.time_preference, a.status, a.created_at,
            COALESCE(r.name, 'Restaurant') as restaurant_name, r.cuisine_type, r.price_range, r.city
     FROM table_alerts a
     LEFT JOIN restaurants r ON a.restaurant_id = r.restaurant_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC`,
    [userId]
  );
  const alerts = result.rows.map((row) => ({
    ...row,
    restaurant_name: row.restaurant_name || 'Restaurant',
  }));
  res.json({ alerts });
});

// Create alert
const createAlert = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { restaurantId, startDate, endDate, timePreference } = req.body;
  if (!restaurantId || !startDate) {
    throw new AppError('restaurantId and startDate are required', 400);
  }
  const end = endDate || startDate;
  const timePref = timePreference || 'any';
  const insert = await query(
    `INSERT INTO table_alerts (user_id, restaurant_id, start_date, end_date, time_preference)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING alert_id, restaurant_id, start_date, end_date, time_preference, status, created_at`,
    [userId, restaurantId, startDate, end, timePref]
  );
  const row = insert.rows[0];
  const restaurant = await query(
    'SELECT name, cuisine_type, price_range, city FROM restaurants WHERE restaurant_id = $1',
    [restaurantId]
  );
  res.status(201).json({
    alert: {
      ...row,
      restaurant_name: restaurant.rows[0]?.name,
      cuisine_type: restaurant.rows[0]?.cuisine_type,
      price_range: restaurant.rows[0]?.price_range,
      city: restaurant.rows[0]?.city,
    },
  });
});

// Delete alert
const deleteAlert = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { alertId } = req.params;
  const result = await query(
    'DELETE FROM table_alerts WHERE alert_id = $1 AND user_id = $2 RETURNING alert_id',
    [alertId, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Alert not found', 404);
  }
  res.json({ success: true });
});

// Demand signal: count of users wanting to share at this restaurant (this week or date range)
const getDemandSignal = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { startDate, endDate } = req.query;
  let start = startDate;
  let end = endDate;
  if (!start || !end) {
    const d = new Date();
    const toMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - toMonday);
    start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    end = d.toISOString().slice(0, 10);
  }
  const result = await query(
    `SELECT COUNT(DISTINCT user_id) as count
     FROM table_alerts
     WHERE restaurant_id = $1 AND status = 'watching'
       AND start_date <= $3 AND end_date >= $2`,
    [restaurantId, start, end]
  );
  const count = parseInt(result.rows[0]?.count || '0', 10);
  res.json({ restaurant_id: restaurantId, start_date: start, end_date: end, count });
});

// Get overlapping alerts for this user (potential "someone wants to share" — for Alert Received view)
const getMatchingAlerts = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT a.alert_id, a.restaurant_id, a.start_date, a.end_date, a.time_preference, a.created_at,
            COALESCE(r.name, 'Restaurant') as restaurant_name, r.cuisine_type, r.city,
            u.user_id as other_user_id, u.first_name as other_first_name, u.last_name as other_last_name,
            u.avatar_url as other_avatar_url
     FROM table_alerts my
     JOIN table_alerts a ON a.restaurant_id = my.restaurant_id
       AND a.user_id != my.user_id
       AND a.status = 'watching'
       AND a.start_date <= my.end_date AND a.end_date >= my.start_date
     LEFT JOIN restaurants r ON r.restaurant_id = a.restaurant_id
     JOIN users u ON u.user_id = a.user_id
     WHERE my.user_id = $1 AND my.status = 'watching'
     ORDER BY a.created_at DESC`,
    [userId]
  );
  const matching_alerts = result.rows.map((row) => ({
    ...row,
    restaurant_name: row.restaurant_name || 'Restaurant',
  }));
  res.json({ matching_alerts });
});

module.exports = {
  getMyAlerts,
  createAlert,
  deleteAlert,
  getDemandSignal,
  getMatchingAlerts,
};
