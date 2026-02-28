const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// List my lists
const getMyLists = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT l.list_id, l.name, l.is_default, l.created_at,
            (SELECT COUNT(*) FROM dining_list_entries e WHERE e.list_id = l.list_id) as restaurant_count
     FROM dining_lists l
     WHERE l.user_id = $1
     ORDER BY l.is_default DESC, l.created_at ASC`,
    [userId]
  );
  const lists = result.rows.map((r) => ({
    list_id: r.list_id,
    name: r.name,
    is_default: r.is_default,
    created_at: r.created_at,
    restaurant_count: parseInt(r.restaurant_count || '0', 10),
  }));
  res.json({ lists });
});

// Create list
const createList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { name, isDefault } = req.body;
  if (!name || !name.trim()) {
    throw new AppError('List name is required', 400);
  }
  const insert = await query(
    `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, $2, $3)
     RETURNING list_id, name, is_default, created_at`,
    [userId, name.trim(), !!isDefault]
  );
  const row = insert.rows[0];
  res.status(201).json({ list: { ...row, restaurant_count: 0 } });
});

// Ensure default "Want to Try" list exists for user
const ensureDefaultList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const existing = await query(
    'SELECT list_id FROM dining_lists WHERE user_id = $1 AND is_default = true',
    [userId]
  );
  if (existing.rows.length > 0) {
    return res.json({ list_id: existing.rows[0].list_id, created: false });
  }
  const insert = await query(
    `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, 'Want to Try', true)
     RETURNING list_id`,
    [userId]
  );
  res.status(201).json({ list_id: insert.rows[0].list_id, created: true });
});

// Get list detail with restaurants and match signal (count + names of other users who saved same restaurant)
const getListDetail = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const listResult = await query(
    'SELECT list_id, name, is_default FROM dining_lists WHERE list_id = $1 AND user_id = $2',
    [listId, userId]
  );
  if (listResult.rows.length === 0) {
    throw new AppError('List not found', 404);
  }
  const list = listResult.rows[0];
  const entries = await query(
    `SELECT e.restaurant_id, e.added_at,
            r.name as restaurant_name, r.cuisine_type, r.price_range, r.city,
            (SELECT COUNT(DISTINCT l2.user_id)
             FROM dining_list_entries e2
             JOIN dining_lists l2 ON l2.list_id = e2.list_id AND l2.user_id != $1
             WHERE e2.restaurant_id = e.restaurant_id) as others_count
     FROM dining_list_entries e
     JOIN restaurants r ON r.restaurant_id = e.restaurant_id
     WHERE e.list_id = $2
     ORDER BY e.added_at DESC`,
    [userId, listId]
  );

  const restaurantIds = entries.rows.map((r) => r.restaurant_id).filter(Boolean);
  const othersByRestaurant = {};
  if (restaurantIds.length > 0) {
    const othersResult = await query(
      `SELECT e.restaurant_id, u.user_id, u.first_name, u.last_name
       FROM dining_list_entries e
       JOIN dining_lists l ON l.list_id = e.list_id AND l.user_id != $1
       JOIN users u ON u.user_id = l.user_id
       WHERE e.restaurant_id = ANY($2)
       ORDER BY e.restaurant_id, u.first_name, u.last_name`,
      [userId, restaurantIds]
    );
    const seen = {};
    for (const row of othersResult.rows) {
      const id = row.restaurant_id;
      const key = `${id}:${row.user_id}`;
      if (seen[key]) continue;
      seen[key] = true;
      if (!othersByRestaurant[id]) othersByRestaurant[id] = [];
      othersByRestaurant[id].push({
        user_id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
      });
    }
  }

  res.json({
    list: {
      list_id: list.list_id,
      name: list.name,
      is_default: list.is_default,
      restaurants: entries.rows.map((r) => ({
        restaurant_id: r.restaurant_id,
        restaurant_name: r.restaurant_name,
        cuisine_type: r.cuisine_type,
        price_range: r.price_range,
        city: r.city,
        added_at: r.added_at,
        others_want_to_try: parseInt(r.others_count || '0', 10),
        others_who_want_to_try: othersByRestaurant[r.restaurant_id] || [],
      })),
    },
  });
});

// Add restaurant to list
const addRestaurant = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const { restaurantId } = req.body;
  if (!restaurantId) {
    throw new AppError('restaurantId is required', 400);
  }
  const listCheck = await query(
    'SELECT list_id FROM dining_lists WHERE list_id = $1 AND user_id = $2',
    [listId, userId]
  );
  if (listCheck.rows.length === 0) {
    throw new AppError('List not found', 404);
  }
  await query(
    `INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)
     ON CONFLICT (list_id, restaurant_id) DO NOTHING`,
    [listId, restaurantId]
  );
  res.status(201).json({ success: true, message: 'Added to list' });
});

// Remove restaurant from list
const removeRestaurant = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId, restaurantId } = req.params;
  const result = await query(
    `DELETE FROM dining_list_entries e
     USING dining_lists l
     WHERE e.list_id = l.list_id AND l.user_id = $1 AND e.list_id = $2 AND e.restaurant_id = $3
     RETURNING e.list_id`,
    [userId, listId, restaurantId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Entry not found', 404);
  }
  res.json({ success: true });
});

// Match signal for a single restaurant: how many other users have this on any list
const getRestaurantMatchSignal = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const result = await query(
    `SELECT COUNT(DISTINCT l.user_id) as count
     FROM dining_list_entries e
     JOIN dining_lists l ON l.list_id = e.list_id
     WHERE e.restaurant_id = $1`,
    [restaurantId]
  );
  const count = parseInt(result.rows[0]?.count || '0', 10);
  res.json({ restaurant_id: restaurantId, others_want_to_try: count });
});

module.exports = {
  getMyLists,
  createList,
  ensureDefaultList,
  getListDetail,
  addRestaurant,
  removeRestaurant,
  getRestaurantMatchSignal,
};
