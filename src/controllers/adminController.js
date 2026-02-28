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
    queryText += ` WHERE email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount}`;
    queryParams.push(`%${search}%`);
    paramCount++;
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(parseInt(limit), parseInt(offset));

  const result = await query(queryText, queryParams);

  // Get total count
  const countQuery = search 
    ? `SELECT COUNT(*) as total FROM users WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`
    : 'SELECT COUNT(*) as total FROM users';
  const countParams = search ? [`%${search}%`] : [];
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
  const { name, address, city, cuisine_type, price_range, phone, website, description, hours } = req.body;

  if (!name) {
    throw new AppError('Restaurant name is required', 400);
  }

  const result = await query(
    `INSERT INTO restaurants (name, address, city, cuisine_type, price_range, phone, website, description, hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [name, address || null, city || null, cuisine_type || null, price_range || null, phone || null, website || null, description || null, hours || null]
  );

  res.status(201).json({
    message: 'Restaurant created successfully',
    restaurant: result.rows[0],
  });
});

// Update a restaurant (admin or restaurant owner)
const updateRestaurant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const { name, cuisine, address, phone, website, description, hours, price_range } = req.body;

  // Verify restaurant exists
  const existing = await query('SELECT restaurant_id FROM restaurants WHERE restaurant_id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new AppError('Restaurant not found', 404);
  }

  const result = await query(
    `UPDATE restaurants SET
      name = COALESCE($1, name),
      cuisine_type = COALESCE($2, cuisine_type),
      address = COALESCE($3, address),
      phone = COALESCE($4, phone),
      website = COALESCE($5, website),
      description = COALESCE($6, description),
      hours = COALESCE($7, hours),
      price_range = COALESCE($8, price_range)
    WHERE restaurant_id = $9
    RETURNING *`,
    [name, cuisine, address, phone, website, description, hours, price_range, id]
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

// Get platform stats
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

  res.json({
    stats: {
      total_users: parseInt(users.rows[0].count),
      active_users: parseInt(activeUsers.rows[0].count),
      total_restaurants: parseInt(restaurants.rows[0].count),
      total_check_ins: parseInt(checkIns.rows[0].count),
      total_matches: parseInt(matches.rows[0].count),
      total_messages: parseInt(messages.rows[0].count),
      total_ratings: parseInt(ratings.rows[0].count),
    },
  });
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
  const userRole = role || 'user';
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

  const isAdmin = role === 'admin' ? true : (role ? false : undefined);

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
    [email, first_name, last_name, role, isAdmin, restaurant_id !== undefined ? restaurant_id : null, passwordHash, id]
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
};
