const { query, pool } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Helper: check list access (owner or editor). Returns list row or null. Tolerates missing sort_order / dining_list_members.
async function getListIfAllowed(listId, userId, allowEditor = true) {
  let ownerResult;
  try {
    ownerResult = await query(
      'SELECT list_id, name, is_default, sort_order FROM dining_lists WHERE list_id = $1 AND user_id = $2',
      [listId, userId]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      ownerResult = await query(
        'SELECT list_id, name, is_default FROM dining_lists WHERE list_id = $1 AND user_id = $2',
        [listId, userId]
      );
      ownerResult.rows.forEach((r) => { r.sort_order = null; });
    } else throw err;
  }
  if (ownerResult.rows.length > 0) return { list: ownerResult.rows[0], isOwner: true };
  if (!allowEditor) return null;
  let memberResult;
  try {
    memberResult = await query(
      'SELECT 1 FROM dining_list_members WHERE list_id = $1 AND user_id = $2',
      [listId, userId]
    );
  } catch (err) {
    if (err.message && /relation.*does not exist/i.test(err.message)) return null;
    throw err;
  }
  if (memberResult.rows.length === 0) return null;
  let listResult;
  try {
    listResult = await query('SELECT list_id, name, is_default, sort_order FROM dining_lists WHERE list_id = $1', [listId]);
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      listResult = await query('SELECT list_id, name, is_default FROM dining_lists WHERE list_id = $1', [listId]);
      listResult.rows.forEach((x) => { x.sort_order = null; });
    } else throw err;
  }
  return listResult.rows.length > 0 ? { list: listResult.rows[0], isOwner: false } : null;
}

// List my lists (only own lists). Uses enhanced query if migration 046 applied; fallback otherwise.
const getMyLists = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  let result;
  try {
    result = await query(
      `SELECT l.list_id, l.name, l.is_default, l.sort_order, l.created_at,
              (SELECT COUNT(*) FROM dining_list_entries e WHERE e.list_id = l.list_id) as restaurant_count,
              (SELECT r.photo_url FROM dining_list_entries e
               JOIN restaurants r ON r.restaurant_id = e.restaurant_id
               WHERE e.list_id = l.list_id
               ORDER BY COALESCE(e.position, 999) ASC, e.added_at DESC LIMIT 1) as cover_image_url
       FROM dining_lists l
       WHERE l.user_id = $1
       ORDER BY COALESCE(l.sort_order, 999) ASC, l.is_default DESC, l.created_at ASC`,
      [userId]
    );
  } catch (err) {
    if (err.message && /column.*does not exist|relation.*does not exist/i.test(err.message)) {
      result = await query(
        `SELECT l.list_id, l.name, l.is_default, l.created_at,
                (SELECT COUNT(*) FROM dining_list_entries e WHERE e.list_id = l.list_id) as restaurant_count
         FROM dining_lists l
         WHERE l.user_id = $1
         ORDER BY l.is_default DESC, l.created_at ASC`,
        [userId]
      );
      result.rows.forEach((r) => { r.sort_order = null; r.cover_image_url = null; });
    } else throw err;
  }
  const lists = result.rows.map((r) => ({
    list_id: r.list_id,
    name: r.name,
    is_default: r.is_default,
    sort_order: r.sort_order != null ? parseInt(r.sort_order, 10) : null,
    created_at: r.created_at,
    restaurant_count: parseInt(r.restaurant_count || '0', 10),
    cover_image_url: r.cover_image_url || null,
  }));
  res.json({ lists });
});

// Create list (works with or without migration 046 sort_order column)
const createList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { name, isDefault: isDefaultBody } = req.body;
  if (!name || !name.trim()) {
    throw new AppError('List name is required', 400);
  }
  const isDefault = !!isDefaultBody;
  let insert;
  try {
    const maxOrder = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM dining_lists WHERE user_id = $1',
      [userId]
    );
    const sortOrder = isDefault ? 0 : (maxOrder.rows[0]?.next_order ?? 0);
    insert = await query(
      `INSERT INTO dining_lists (user_id, name, is_default, sort_order) VALUES ($1, $2, $3, $4)
       RETURNING list_id, name, is_default, sort_order, created_at`,
      [userId, name.trim(), isDefault, sortOrder]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      insert = await query(
        `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, $2, $3)
         RETURNING list_id, name, is_default, created_at`,
        [userId, name.trim(), isDefault]
      );
      insert.rows[0].sort_order = null;
    } else throw err;
  }
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
  let insert;
  try {
    insert = await query(
      `INSERT INTO dining_lists (user_id, name, is_default, sort_order) VALUES ($1, 'Want to Try', true, 0)
       RETURNING list_id`,
      [userId]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      insert = await query(
        `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, 'Want to Try', true)
         RETURNING list_id`,
        [userId]
      );
    } else throw err;
  }
  res.status(201).json({ list_id: insert.rows[0].list_id, created: true });
});

// Get list detail with restaurants and match signal (owner or editor)
const getListDetail = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);
  const list = access.list;
  let entries;
  try {
    entries = await query(
      `SELECT e.restaurant_id, e.added_at, e.notes, e.position,
              r.name as restaurant_name, r.cuisine_type, r.price_range, r.city, r.photo_url,
              (SELECT COUNT(DISTINCT l2.user_id)
               FROM dining_list_entries e2
               JOIN dining_lists l2 ON l2.list_id = e2.list_id AND l2.user_id != $1
               WHERE e2.restaurant_id = e.restaurant_id) as others_count
       FROM dining_list_entries e
       JOIN restaurants r ON r.restaurant_id = e.restaurant_id
       WHERE e.list_id = $2
       ORDER BY COALESCE(e.position, 999) ASC, e.added_at DESC`,
      [userId, listId]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      entries = await query(
        `SELECT e.restaurant_id, e.added_at,
                r.name as restaurant_name, r.cuisine_type, r.price_range, r.city, r.photo_url,
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
      entries.rows.forEach((r) => { r.notes = null; r.position = null; });
    } else throw err;
  }

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

  const restaurants = entries.rows.map((r) => ({
    restaurant_id: r.restaurant_id,
    restaurant_name: r.restaurant_name,
    cuisine_type: r.cuisine_type,
    price_range: r.price_range,
    city: r.city,
    photo_url: r.photo_url || null,
    added_at: r.added_at,
    notes: r.notes || null,
    position: r.position != null ? parseInt(r.position, 10) : null,
    others_want_to_try: parseInt(r.others_count || '0', 10),
    others_who_want_to_try: othersByRestaurant[r.restaurant_id] || [],
  }));
  const cover_image_url = restaurants.length > 0 && restaurants[0].photo_url ? restaurants[0].photo_url : null;

  res.json({
    list: {
      list_id: list.list_id,
      name: list.name,
      is_default: list.is_default,
      sort_order: list.sort_order != null ? parseInt(list.sort_order, 10) : null,
      is_owner: access.isOwner,
      cover_image_url,
      restaurants,
    },
  });
});

// Update list (rename, set default, reorder) — owner only
const updateList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const { name, is_default: isDefault, sort_order: sortOrder } = req.body;
  const access = await getListIfAllowed(listId, userId, false);
  if (!access || !access.isOwner) throw new AppError('List not found', 404);

  const updates = [];
  const values = [];
  let idx = 1;
  if (name !== undefined && name !== null) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new AppError('List name cannot be empty', 400);
    updates.push(`name = $${idx++}`);
    values.push(trimmed);
  }
  if (isDefault === true) {
    await query(
      'UPDATE dining_lists SET is_default = false WHERE user_id = $1',
      [userId]
    );
    updates.push(`is_default = true`);
  } else if (isDefault === false) {
    updates.push(`is_default = false`);
  }
  if (sortOrder !== undefined && sortOrder !== null) {
    updates.push(`sort_order = $${idx++}`);
    values.push(parseInt(sortOrder, 10));
  }
  if (updates.length === 0) {
    return res.json({ success: true, list: access.list });
  }
  values.push(listId, userId);
  try {
    await query(
      `UPDATE dining_lists SET ${updates.join(', ')} WHERE list_id = $${idx} AND user_id = $${idx + 1}`,
      values
    );
  } catch (err) {
    if (err.message && /column.*sort_order.*does not exist/i.test(err.message)) {
      const sortIdx = updates.findIndex((u) => u.startsWith('sort_order'));
      const withoutSort = updates.filter((u) => !u.startsWith('sort_order'));
      let valsWithoutSort = values.slice(0, -2);
      if (sortIdx !== -1) valsWithoutSort.splice(sortIdx, 1);
      if (withoutSort.length > 0) {
        let i = 1;
        const setClause = withoutSort.map((u) => u.replace(/\$\d+/, () => `$${i++}`)).join(', ');
        valsWithoutSort.push(listId, userId);
        await query(
          `UPDATE dining_lists SET ${setClause} WHERE list_id = $${i} AND user_id = $${i + 1}`,
          valsWithoutSort
        );
      }
    } else throw err;
  }
  res.json({ success: true, message: 'List updated' });
});

// Add restaurant to list (owner or editor)
const addRestaurant = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const { restaurantId } = req.body;
  if (!restaurantId) {
    throw new AppError('restaurantId is required', 400);
  }
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);

  let insertResult;
  try {
    const maxPos = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM dining_list_entries WHERE list_id = $1',
      [listId]
    );
    const position = maxPos.rows[0]?.next_pos ?? 0;
    insertResult = await query(
      `INSERT INTO dining_list_entries (list_id, restaurant_id, position) VALUES ($1, $2, $3)
       ON CONFLICT (list_id, restaurant_id) DO NOTHING
       RETURNING list_id`,
      [listId, restaurantId, position]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      insertResult = await query(
        `INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)
         ON CONFLICT (list_id, restaurant_id) DO NOTHING
         RETURNING list_id`,
        [listId, restaurantId]
      );
    } else throw err;
  }
  if (insertResult.rows.length > 0) {
    query(
      `INSERT INTO activities (user_id, type, target_type, target_id) VALUES ($1, 'added_to_list', 'restaurant', $2)`,
      [userId, restaurantId]
    ).catch(() => {});
  }
  res.status(201).json({ success: true, message: 'Added to list' });
});

// Remove restaurant from list (owner or editor)
const removeRestaurant = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId, restaurantId } = req.params;
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);
  const result = await query(
    `DELETE FROM dining_list_entries e
     WHERE e.list_id = $1 AND e.restaurant_id = $2
     RETURNING e.list_id`,
    [listId, restaurantId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Entry not found', 404);
  }
  res.json({ success: true });
});

// Update entry (notes, position) — owner or editor. No-op if migration 046 not applied.
const updateEntry = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId, restaurantId } = req.params;
  const { notes, position } = req.body;
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);

  const updates = [];
  const values = [];
  let idx = 1;
  if (notes !== undefined) {
    updates.push(`notes = $${idx++}`);
    values.push(notes == null || notes === '' ? null : String(notes).trim().slice(0, 1000));
  }
  if (position !== undefined && position !== null) {
    updates.push(`position = $${idx++}`);
    values.push(parseInt(position, 10));
  }
  if (updates.length === 0) return res.json({ success: true });
  values.push(listId, restaurantId);
  try {
    const result = await query(
      `UPDATE dining_list_entries SET ${updates.join(', ')} WHERE list_id = $${idx} AND restaurant_id = $${idx + 1} RETURNING list_id`,
      values
    );
    if (result.rows.length === 0) throw new AppError('Entry not found', 404);
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) return res.json({ success: true });
    if (err instanceof AppError) throw err;
    throw err;
  }
  res.json({ success: true });
});

// Reorder entries: body { restaurant_ids: [uuid, ...] }. No-op if position column missing.
const reorderEntries = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const { restaurant_ids: restaurantIds } = req.body;
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);
  if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
    return res.json({ success: true });
  }
  const client = await pool.connect();
  try {
    for (let i = 0; i < restaurantIds.length; i++) {
      await client.query(
        'UPDATE dining_list_entries SET position = $1 WHERE list_id = $2 AND restaurant_id = $3',
        [i, listId, restaurantIds[i]]
      );
    }
    res.json({ success: true });
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) res.json({ success: true });
    else throw err;
  } finally {
    client.release();
  }
});

// Duplicate list: create new list with same name + " (copy)" and copy entries. Tolerates missing migration 046.
const duplicateList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const access = await getListIfAllowed(listId, userId, true);
  if (!access) throw new AppError('List not found', 404);

  const list = access.list;
  const baseName = (list.name || 'List').trim();
  const newName = baseName.length + 6 > 255 ? baseName.slice(0, 249) + ' (copy)' : baseName + ' (copy)';
  let newListId;
  try {
    const maxOrder = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM dining_lists WHERE user_id = $1',
      [userId]
    );
    const sortOrder = maxOrder.rows[0]?.next_order ?? 0;
    const insertList = await query(
      `INSERT INTO dining_lists (user_id, name, is_default, sort_order) VALUES ($1, $2, false, $3)
       RETURNING list_id`,
      [userId, newName, sortOrder]
    );
    newListId = insertList.rows[0].list_id;
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      const insertList = await query(
        `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, $2, false)
         RETURNING list_id`,
        [userId, newName]
      );
      newListId = insertList.rows[0].list_id;
    } else throw err;
  }
  let entries;
  try {
    entries = await query(
      'SELECT restaurant_id, notes, position FROM dining_list_entries WHERE list_id = $1 ORDER BY COALESCE(position, 999) ASC, added_at DESC',
      [listId]
    );
  } catch (err) {
    if (err.message && /column.*does not exist/i.test(err.message)) {
      entries = await query(
        'SELECT restaurant_id FROM dining_list_entries WHERE list_id = $1 ORDER BY added_at DESC',
        [listId]
      );
      entries.rows.forEach((r) => { r.notes = null; r.position = null; });
    } else throw err;
  }
  for (const row of entries.rows) {
    try {
      await query(
        `INSERT INTO dining_list_entries (list_id, restaurant_id, notes, position) VALUES ($1, $2, $3, $4)
         ON CONFLICT (list_id, restaurant_id) DO NOTHING`,
        [newListId, row.restaurant_id, row.notes || null, row.position != null ? row.position : 0]
      );
    } catch (err) {
      if (err.message && /column.*does not exist/i.test(err.message)) {
        await query(
          `INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)
           ON CONFLICT (list_id, restaurant_id) DO NOTHING`,
          [newListId, row.restaurant_id]
        );
      } else throw err;
    }
  }
  res.status(201).json({
    success: true,
    list_id: newListId,
    name: newName,
    message: 'List duplicated',
  });
});

// Add editor to list (owner only)
const addListMember = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const { user_id: memberUserId } = req.body;
  const memberId = memberUserId || req.params.userId;
  if (!memberId) throw new AppError('user_id is required', 400);
  const access = await getListIfAllowed(listId, userId, false);
  if (!access || !access.isOwner) throw new AppError('List not found', 404);
  if (memberId === userId) throw new AppError('You cannot add yourself as editor', 400);
  try {
    await query(
      `INSERT INTO dining_list_members (list_id, user_id, role) VALUES ($1, $2, 'editor')
       ON CONFLICT (list_id, user_id) DO NOTHING`,
      [listId, memberId]
    );
  } catch (err) {
    if (err.message && /relation.*dining_list_members.*does not exist/i.test(err.message)) {
      throw new AppError('List sharing is not available. Please run database migrations.', 503);
    }
    throw err;
  }
  res.status(201).json({ success: true, message: 'Editor added' });
});

// Remove editor from list (owner only)
const removeListMember = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId, memberId } = req.params;
  const access = await getListIfAllowed(listId, userId, false);
  if (!access || !access.isOwner) throw new AppError('List not found', 404);
  try {
    await query('DELETE FROM dining_list_members WHERE list_id = $1 AND user_id = $2', [listId, memberId]);
  } catch (err) {
    if (err.message && /relation.*dining_list_members.*does not exist/i.test(err.message)) {
      throw new AppError('List sharing is not available. Please run database migrations.', 503);
    }
    throw err;
  }
  res.json({ success: true });
});

// Delete a list (and all its entries). Cannot delete the default list.
const deleteList = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { listId } = req.params;
  const listCheck = await query(
    'SELECT list_id, is_default FROM dining_lists WHERE list_id = $1 AND user_id = $2',
    [listId, userId]
  );
  if (listCheck.rows.length === 0) {
    throw new AppError('List not found', 404);
  }
  if (listCheck.rows[0].is_default === true) {
    throw new AppError('Cannot delete your default list. Create another list and make it default first, or keep "Want to Try".', 400);
  }
  await query('DELETE FROM dining_list_entries WHERE list_id = $1', [listId]);
  await query('DELETE FROM dining_lists WHERE list_id = $1 AND user_id = $2', [listId, userId]);
  res.json({ success: true, message: 'List deleted' });
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
  updateList,
  addRestaurant,
  removeRestaurant,
  updateEntry,
  reorderEntries,
  duplicateList,
  addListMember,
  removeListMember,
  deleteList,
  getRestaurantMatchSignal,
};
