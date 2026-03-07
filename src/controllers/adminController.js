const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Get all users (admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, search } = req.query;

  let queryText = 'SELECT user_id, email, first_name, last_name, role, is_admin, created_at FROM users';
  const queryParams = [];
  let paramCount = 1;

  if (search) {
    const searchTrimmed = String(search).trim().slice(0, 200);
    if (searchTrimmed) {
      queryText += ` WHERE email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount}`;
      queryParams.push(`%${searchTrimmed}%`);
      paramCount++;
    }
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  // Get total count
  const searchForCount = search ? String(search).trim().slice(0, 200) : '';
  const countQuery = searchForCount
    ? `SELECT COUNT(*) as total FROM users WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`
    : 'SELECT COUNT(*) as total FROM users';
  const countParams = searchForCount ? [`%${searchForCount}%`] : [];
  const countResult = await query(countQuery, countParams);

  res.json({
    users: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Get all restaurants (admin view)
const getAllRestaurants = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, search } = req.query;

  let queryText = `
    SELECT 
      r.restaurant_id, r.name, r.address, r.city, r.cuisine_type, 
      r.price_range, r.rating, r.phone, r.website, r.hours, r.description,
      r.noise_level, r.tableshare_offer, r.menu_url, r.specials,
      r.created_at,
      COUNT(DISTINCT ci.check_in_id) as check_in_count
    FROM restaurants r
    LEFT JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
  `;
  const queryParams = [];
  let paramCount = 1;

  if (search) {
    queryText += ` WHERE r.name ILIKE $${paramCount} OR r.city ILIKE $${paramCount}`;
    queryParams.push(`%${search}%`);
    paramCount++;
  }

  queryText += ` GROUP BY r.restaurant_id ORDER BY r.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  const countQuery = search
    ? `SELECT COUNT(*) as total FROM restaurants WHERE name ILIKE $1 OR city ILIKE $1`
    : 'SELECT COUNT(*) as total FROM restaurants';
  const countParams = search ? [`%${search}%`] : [];
  const countResult = await query(countQuery, countParams);

  res.json({
    restaurants: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Create a new restaurant (admin)
const createRestaurant = asyncHandler(async (req, res) => {
  const { name, address, city, cuisine_type, price_range, phone, website, description, hours, noise_level, tableshare_offer, menu_url, specials } = req.body;

  if (!name) {
    throw new AppError('Restaurant name is required', 400);
  }

  const result = await query(
    `INSERT INTO restaurants (name, address, city, cuisine_type, price_range, phone, website, description, hours, noise_level, tableshare_offer, menu_url, specials)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [name, address || null, city || null, cuisine_type || null, price_range || null, phone || null, website || null, description || null, hours || null, noise_level || null, tableshare_offer || null, menu_url || null, specials || null]
  );

  res.status(201).json({
    message: 'Restaurant created successfully',
    restaurant: result.rows[0],
  });
});

// Update a restaurant (admin or restaurant owner)
const updateRestaurant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, cuisine, cuisine_type, address, city, phone, website, description, hours, price_range, noise_level, tableshare_offer, menu_url, specials, is_accepting_diners, availability_settings } = req.body;

  // Verify restaurant exists
  const existing = await query('SELECT restaurant_id FROM restaurants WHERE restaurant_id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('Restaurant not found', 404);
  }

  const cuisineVal = cuisine_type ?? cuisine;
  const availabilityJson = availability_settings !== undefined
    ? JSON.stringify(availability_settings)
    : null;

  const result = await query(
    `UPDATE restaurants SET
      name = COALESCE($1, name),
      cuisine_type = COALESCE($2, cuisine_type),
      address = COALESCE($3, address),
      city = COALESCE($4, city),
      phone = COALESCE($5, phone),
      website = COALESCE($6, website),
      description = COALESCE($7, description),
      hours = COALESCE($8, hours),
      price_range = COALESCE($9, price_range),
      noise_level = COALESCE($10, noise_level),
      tableshare_offer = COALESCE($11, tableshare_offer),
      menu_url = COALESCE($12, menu_url),
      specials = COALESCE($13, specials),
      is_accepting_diners = CASE WHEN $14::boolean IS NOT NULL THEN $14::boolean ELSE is_accepting_diners END,
      availability_settings = CASE WHEN $15::jsonb IS NOT NULL THEN $15::jsonb ELSE availability_settings END
    WHERE restaurant_id = $16
    RETURNING *`,
    [name, cuisineVal, address, city, phone, website, description, hours, price_range, noise_level, tableshare_offer, menu_url, specials, is_accepting_diners !== undefined ? is_accepting_diners : null, availabilityJson, id]
  );

  res.json({
    message: 'Restaurant updated successfully',
    restaurant: result.rows[0],
  });
});

// Delete a restaurant (admin)
const deleteRestaurant = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query('SELECT restaurant_id, name FROM restaurants WHERE restaurant_id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('Restaurant not found', 404);
  }

  // Clear restaurant_id from any users assigned to this restaurant
  await query('UPDATE users SET restaurant_id = NULL WHERE restaurant_id = $1', [id]);

  await query('DELETE FROM restaurants WHERE restaurant_id = $1', [id]);

  res.json({
    message: 'Restaurant deleted successfully',
    deleted: existing.rows[0],
  });
});

// Get all check-ins (admin view)
const getAllCheckIns = asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0, restaurant_id } = req.query;

  let queryText = `
    SELECT 
      ci.check_in_id, ci.party_size, ci.notes, ci.photo_url,
      ci.check_in_time, ci.is_active,
      u.user_id, u.first_name, u.last_name, u.email,
      r.restaurant_id, r.name as restaurant_name, r.address, r.city
    FROM check_ins ci
    JOIN users u ON ci.user_id = u.user_id
    JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
  `;
  const queryParams = [];
  let paramCount = 1;

  if (restaurant_id) {
    queryText += ` WHERE ci.restaurant_id = $${paramCount}`;
    queryParams.push(restaurant_id);
    paramCount++;
  }

  queryText += ` ORDER BY ci.check_in_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  const countQuery = restaurant_id
    ? `SELECT COUNT(*) as total FROM check_ins WHERE restaurant_id = $1`
    : 'SELECT COUNT(*) as total FROM check_ins';
  const countParams = restaurant_id ? [restaurant_id] : [];
  const countResult = await query(countQuery, countParams);

  res.json({
    checkins: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Get all ratings (admin view)
const getAllRatings = asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0, restaurant_id } = req.query;

  let queryText = `
    SELECT 
      r.rating_id, r.rating_value, r.would_dine_again, r.feedback, r.created_at,
      u1.user_id as rater_id, u1.first_name || ' ' || u1.last_name as rater_name,
      u2.user_id as rated_user_id, u2.first_name || ' ' || u2.last_name as rated_user_name,
      m.match_id,
      res.restaurant_id, res.name as restaurant_name
    FROM ratings r
    JOIN users u1 ON r.rater_id = u1.user_id
    JOIN users u2 ON r.rated_user_id = u2.user_id
    JOIN matches m ON r.match_id = m.match_id
    JOIN restaurants res ON m.restaurant_id = res.restaurant_id
  `;
  const queryParams = [];
  let paramCount = 1;

  if (restaurant_id) {
    queryText += ` WHERE res.restaurant_id = $${paramCount}`;
    queryParams.push(restaurant_id);
    paramCount++;
  }

  queryText += ` ORDER BY r.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  const countQuery = restaurant_id
    ? `SELECT COUNT(*) as total FROM ratings r JOIN matches m ON r.match_id = m.match_id WHERE m.restaurant_id = $1`
    : 'SELECT COUNT(*) as total FROM ratings';
  const countParams = restaurant_id ? [restaurant_id] : [];
  const countResult = await query(countQuery, countParams);

  res.json({
    ratings: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Get platform stats (with period-over-period deltas)
const getPlatformStats = asyncHandler(async (req, res) => {
  const [users, restaurants, checkIns, matches, messages, ratings] = await Promise.all([
    query('SELECT COUNT(*) as count FROM users'),
    query('SELECT COUNT(*) as count FROM restaurants'),
    query('SELECT COUNT(*) as count FROM check_ins'),
    query('SELECT COUNT(*) as count FROM matches'),
    query('SELECT COUNT(*) as count FROM messages'),
    query('SELECT COUNT(*) as count FROM ratings'),
  ]);

  // Get active users (users with check-ins in last 30 days)
  const activeUsers = await query(`
    SELECT COUNT(DISTINCT user_id) as count 
    FROM check_ins 
    WHERE check_in_time > NOW() - INTERVAL '30 days'
  `);

  // Period-over-period deltas
  const [activeUsersPrev, checkInsPrev, matchesPrev, restaurantsPrev] = await Promise.all([
    query(`SELECT COUNT(DISTINCT user_id) as count FROM check_ins WHERE check_in_time > NOW() - INTERVAL '60 days' AND check_in_time <= NOW() - INTERVAL '30 days'`),
    query(`SELECT COUNT(*) as count FROM check_ins WHERE check_in_time > NOW() - INTERVAL '14 days' AND check_in_time <= NOW() - INTERVAL '7 days'`),
    query(`SELECT COUNT(*) as count FROM matches WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days'`),
    query(`SELECT COUNT(*) as count FROM restaurants WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days'`),
  ]);

  const checkInsThisWeek = await query(`SELECT COUNT(*) as count FROM check_ins WHERE check_in_time > NOW() - INTERVAL '7 days'`);
  const matchesThisWeek = await query(`SELECT COUNT(*) as count FROM matches WHERE created_at > NOW() - INTERVAL '7 days'`);
  const restaurantsThisWeek = await query(`SELECT COUNT(*) as count FROM restaurants WHERE created_at > NOW() - INTERVAL '7 days'`);

  const activeUsersPrevCount = parseInt(activeUsersPrev.rows[0]?.count || 0);
  const activeUsersCount = parseInt(activeUsers.rows[0].count);
  const activeUsersDelta = activeUsersPrevCount > 0 ? (((activeUsersCount - activeUsersPrevCount) / activeUsersPrevCount) * 100).toFixed(0) : 0;

  const checkInsPrevCount = parseInt(checkInsPrev.rows[0]?.count || 0);
  const checkInsThisWeekCount = parseInt(checkInsThisWeek.rows[0]?.count || 0);
  const checkInsDelta = checkInsPrevCount > 0 ? (((checkInsThisWeekCount - checkInsPrevCount) / checkInsPrevCount) * 100).toFixed(0) : 0;

  const matchesPrevCount = parseInt(matchesPrev.rows[0]?.count || 0);
  const matchesThisWeekCount = parseInt(matchesThisWeek.rows[0]?.count || 0);
  const matchesDelta = matchesPrevCount > 0 ? (((matchesThisWeekCount - matchesPrevCount) / matchesPrevCount) * 100).toFixed(0) : 0;

  const restaurantsThisWeekCount = parseInt(restaurantsThisWeek.rows[0]?.count || 0);

  res.json({
    stats: {
      total_users: parseInt(users.rows[0].count),
      active_users: activeUsersCount,
      active_users_delta_pct: parseInt(activeUsersDelta),
      total_restaurants: parseInt(restaurants.rows[0].count),
      restaurants_delta_this_week: restaurantsThisWeekCount,
      total_check_ins: parseInt(checkIns.rows[0].count),
      check_ins_delta_pct: parseInt(checkInsDelta),
      total_matches: parseInt(matches.rows[0].count),
      matches_delta_pct: parseInt(matchesDelta),
      total_messages: parseInt(messages.rows[0].count),
      total_ratings: parseInt(ratings.rows[0].count),
    },
  });
});

// Get time-series trends for admin charts
const getStatsTrends = asyncHandler(async (req, res) => {
  const { metric = 'checkins', days = 30 } = req.query;
  const daysNum = Math.min(90, Math.max(7, parseInt(days) || 30));

  if (metric === 'checkins') {
    const result = await query(
      `SELECT DATE(check_in_time) as day, COUNT(*) as count
       FROM check_ins
       WHERE check_in_time > NOW() - INTERVAL '1 day' * $1
       GROUP BY DATE(check_in_time)
       ORDER BY day ASC`,
      [daysNum]
    );
    const byDay = {};
    result.rows.forEach((r) => { byDay[r.day] = parseInt(r.count); });
    const labels = [];
    const data = [];
    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      labels.push(dayStr);
      data.push(byDay[dayStr] || 0);
    }
    return res.json({ labels, data });
  }

  if (metric === 'users') {
    const result = await query(
      `SELECT DATE(created_at) as day, COUNT(*) as count
       FROM users
       WHERE created_at > NOW() - INTERVAL '1 day' * $1
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [daysNum]
    );
    const byDay = {};
    result.rows.forEach((r) => { byDay[r.day] = parseInt(r.count); });
    const labels = [];
    const data = [];
    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      labels.push(dayStr);
      data.push(byDay[dayStr] || 0);
    }
    return res.json({ labels, data });
  }

  if (metric === 'checkins_by_dow') {
    const result = await query(
      `SELECT EXTRACT(DOW FROM check_in_time)::int as dow, COUNT(*) as count
       FROM check_ins
       WHERE check_in_time > NOW() - INTERVAL '30 days'
       GROUP BY EXTRACT(DOW FROM check_in_time)
       ORDER BY dow`
    );
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    result.rows.forEach((r) => { byDow[r.dow] = parseInt(r.count); });
    return res.json({
      labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      data: byDow,
    });
  }

  throw new AppError('Invalid metric. Use checkins, users, or checkins_by_dow', 400);
});

// Create a new user (admin)
const createUser = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, role, restaurant_id } = req.body;

  if (!email || !password || !first_name || !last_name) {
    throw new AppError('Email, password, first name, and last name are required', 400);
  }

  const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('A user with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const allowedRoles = ['user', 'admin', 'restaurant'];
  const userRole = role && allowedRoles.includes(role) ? role : 'user';
  const isAdmin = userRole === 'admin';

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_admin, restaurant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, email, first_name, last_name, role, is_admin, restaurant_id, created_at`,
    [email, passwordHash, first_name, last_name, userRole, isAdmin, restaurant_id || null]
  );

  res.status(201).json({
    message: 'User created successfully',
    user: result.rows[0],
  });
});

// Update an existing user (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, first_name, last_name, role, restaurant_id, password } = req.body;

  const existing = await query('SELECT user_id FROM users WHERE user_id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  if (email) {
    const dup = await query('SELECT user_id FROM users WHERE email = $1 AND user_id != $2', [email, id]);
    if (dup.rows.length > 0) {
      throw new AppError('Email already in use by another user', 409);
    }
  }

  let passwordHash = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const allowedRoles = ['user', 'admin', 'restaurant'];
  const sanitizedRole = role && allowedRoles.includes(role) ? role : undefined;
  const isAdmin = sanitizedRole === 'admin' ? true : (sanitizedRole ? false : undefined);

  const result = await query(
    `UPDATE users SET
      email = COALESCE($1, email),
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      role = COALESCE($4, role),
      is_admin = COALESCE($5, is_admin),
      restaurant_id = $6,
      password_hash = COALESCE($7, password_hash),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $8
    RETURNING user_id, email, first_name, last_name, role, is_admin, restaurant_id, created_at`,
    [email, first_name, last_name, sanitizedRole, isAdmin, restaurant_id !== undefined ? restaurant_id : null, passwordHash, id]
  );

  res.json({
    message: 'User updated successfully',
    user: result.rows[0],
  });
});

// Delete a user (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query('SELECT user_id, email FROM users WHERE user_id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  await query('DELETE FROM users WHERE user_id = $1', [id]);

  res.json({
    message: 'User deleted successfully',
    deleted: existing.rows[0],
  });
});

// Get all reports (admin only)
const getAllReports = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, status, target_type } = req.query;

  let queryText = `
    SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.details,
           r.created_at, r.status, r.reviewed_at,
           u.first_name as reporter_first_name, u.last_name as reporter_last_name, u.email as reporter_email
    FROM reports r
    LEFT JOIN users u ON r.reporter_id = u.user_id
  `;
  const queryParams = [];
  let paramCount = 1;
  const conditions = [];

  if (status && String(status).trim()) {
    conditions.push(`r.status = $${paramCount}`);
    queryParams.push(String(status).trim());
    paramCount++;
  }
  if (target_type && String(target_type).trim()) {
    conditions.push(`r.target_type = $${paramCount}`);
    queryParams.push(String(target_type).trim());
    paramCount++;
  }
  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ` ORDER BY r.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  const countQuery = conditions.length > 0
    ? `SELECT COUNT(*) as total FROM reports r WHERE ${conditions.join(' AND ')}`
    : 'SELECT COUNT(*) as total FROM reports';
  const countParams = conditions.length > 0 ? queryParams.slice(0, -2) : [];
  const countResult = await query(countQuery, countParams);

  res.json({
    reports: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Update report status (admin only)
const updateReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const existing = await query('SELECT id FROM reports WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('Report not found', 404);
  }

  const validStatuses = ['pending', 'reviewed', 'dismissed', 'action_taken'];
  const newStatus = status && validStatuses.includes(String(status).toLowerCase())
    ? String(status).toLowerCase()
    : 'reviewed';

  await query(
    `UPDATE reports SET status = $1, reviewed_at = COALESCE(reviewed_at, NOW()) WHERE id = $2`,
    [newStatus, id]
  );

  const updated = await query('SELECT * FROM reports WHERE id = $1', [id]);

  res.json({
    message: 'Report updated successfully',
    report: updated.rows[0],
  });
});

// Get promotions for a restaurant (admin or restaurant manager)
const getPromotions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `SELECT id, restaurant_id, title, description, days, time_range, active, created_at
     FROM restaurant_promotions WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  const promotions = (result.rows || []).map((r) => ({
    id: r.id,
    restaurant_id: r.restaurant_id,
    title: r.title,
    description: r.description,
    days: r.days,
    timeRange: r.time_range,
    active: r.active,
    created: r.created_at,
  }));
  res.json({ promotions });
});

// Create promotion (admin or restaurant manager)
const createPromotion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, days, time_range, timeRange } = req.body;

  if (!title) {
    throw new AppError('Promotion title is required', 400);
  }

  const timeRangeVal = time_range || timeRange || null;

  const result = await query(
    `INSERT INTO restaurant_promotions (restaurant_id, title, description, days, time_range, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, restaurant_id, title, description, days, time_range, active, created_at`,
    [id, title, description || null, days || null, timeRangeVal]
  );
  const r = result.rows[0];
  res.status(201).json({
    message: 'Promotion created successfully',
    promotion: {
      id: r.id,
      restaurant_id: r.restaurant_id,
      title: r.title,
      description: r.description,
      days: r.days,
      timeRange: r.time_range,
      active: r.active,
      created: r.created_at,
    },
  });
});

// Update promotion (admin or restaurant manager)
const updatePromotion = asyncHandler(async (req, res) => {
  const { id, promoId } = req.params;
  const { active } = req.body;

  const existing = await query(
    'SELECT id FROM restaurant_promotions WHERE id = $1 AND restaurant_id = $2',
    [promoId, id]
  );
  if (existing.rows.length === 0) {
    throw new AppError('Promotion not found', 404);
  }

  if (typeof active !== 'boolean') {
    throw new AppError('active must be a boolean', 400);
  }

  const result = await query(
    `UPDATE restaurant_promotions SET active = $1 WHERE id = $2 AND restaurant_id = $3
     RETURNING id, restaurant_id, title, description, days, time_range, active, created_at`,
    [active, promoId, id]
  );
  const r = result.rows[0];
  res.json({
    message: 'Promotion updated successfully',
    promotion: {
      id: r.id,
      restaurant_id: r.restaurant_id,
      title: r.title,
      description: r.description,
      days: r.days,
      timeRange: r.time_range,
      active: r.active,
      created: r.created_at,
    },
  });
});

// Delete promotion (admin or restaurant manager)
const deletePromotion = asyncHandler(async (req, res) => {
  const { id, promoId } = req.params;

  const existing = await query(
    'SELECT id FROM restaurant_promotions WHERE id = $1 AND restaurant_id = $2',
    [promoId, id]
  );
  if (existing.rows.length === 0) {
    throw new AppError('Promotion not found', 404);
  }

  await query('DELETE FROM restaurant_promotions WHERE id = $1 AND restaurant_id = $2', [promoId, id]);
  res.json({ message: 'Promotion deleted successfully' });
});

// Get all blocked users (admin only) - platform-wide block list for support
const getAllBlocks = asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;

  const result = await query(
    `SELECT ub.id, ub.blocker_id, ub.blocked_id, ub.created_at,
            u1.first_name as blocker_first_name, u1.last_name as blocker_last_name, u1.email as blocker_email,
            u2.first_name as blocked_first_name, u2.last_name as blocked_last_name, u2.email as blocked_email
     FROM user_blocks ub
     JOIN users u1 ON ub.blocker_id = u1.user_id
     JOIN users u2 ON ub.blocked_id = u2.user_id
     ORDER BY ub.created_at DESC
     LIMIT $1 OFFSET $2`,
    [parseInt(limit), parseInt(offset)]
  );

  const countResult = await query('SELECT COUNT(*) as total FROM user_blocks');
  res.json({
    blocks: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Get waitlist entries for a restaurant (admin or restaurant manager)
const getRestaurantWaitlist = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await query(`SELECT expire_old_waitlist_entries()`).catch(() => {});

  const result = await query(
    `SELECT w.waitlist_id, w.user_id, w.party_size, w.status, w.joined_at, w.notes,
            u.first_name, u.last_name, u.email,
            calculate_queue_position(w.restaurant_id, w.waitlist_id) as queue_position
     FROM waitlist_entries w
     JOIN users u ON w.user_id = u.user_id
     WHERE w.restaurant_id = $1 AND w.status IN ('waiting', 'notified')
     ORDER BY w.joined_at ASC`,
    [id]
  );

  res.json({ waitlist: result.rows || [] });
});

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getAllCheckIns,
  getAllRatings,
  getPlatformStats,
  getStatsTrends,
  getAllReports,
  updateReport,
  getAllBlocks,
  getRestaurantWaitlist,
  getPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
};
