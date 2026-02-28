const { query } = require('../config/database');
const { generateMatchmakerSuggestions } = require('../config/openai');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// POST /api/v1/table-matchmaker/suggest — suggest restaurants for two diners
const suggestForTwo = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { otherUserId, cuisine, priceRange, neighborhood, dietary, vibe, timePreference } = req.body;

  if (!otherUserId) {
    throw new AppError('otherUserId is required', 400);
  }

  const [user1Rows, user2Rows, restaurantRows] = await Promise.all([
    query(
      `SELECT user_id, first_name, dietary_tags
       FROM users WHERE user_id = $1`,
      [userId]
    ),
    query(
      `SELECT user_id, first_name, dietary_tags
       FROM users WHERE user_id = $1`,
      [otherUserId]
    ),
    query(
      `SELECT restaurant_id, name, cuisine_type, price_range, city
       FROM restaurants WHERE city ILIKE '%Chicago%' LIMIT 80`,
      []
    ),
  ]);

  if (user1Rows.rows.length === 0 || user2Rows.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const formatDietary = (tags) => {
    if (!tags) return 'None specified';
    const arr = typeof tags === 'string' ? (() => { try { return JSON.parse(tags); } catch { return []; } })() : tags;
    return Array.isArray(arr) && arr.length ? arr.join(', ') : 'None specified';
  };
  const prefs = { cuisine, priceRange, vibe, timePreference };
  const preferences = Object.fromEntries(
    Object.entries(prefs).filter(([, v]) => v != null && v !== '')
  );
  const u1 = user1Rows.rows[0];
  const u2 = user2Rows.rows[0];
  const diner1 = {
    name: u1.first_name,
    dietary: formatDietary(u1.dietary_tags),
    preferences,
  };
  const diner2 = {
    name: u2.first_name,
    dietary: formatDietary(u2.dietary_tags),
    preferences,
  };

  if (restaurantRows.rows.length === 0) {
    return res.json({ suggestions: [], message: 'No restaurants in database yet.' });
  }

  let suggestions;
  try {
    suggestions = await generateMatchmakerSuggestions(diner1, diner2, restaurantRows.rows, 3);
  } catch (err) {
    console.error('Matchmaker OpenAI error:', err);
    return res.status(200).json({
      suggestions: [],
      message: 'AI suggestions are temporarily unavailable. Check that OPENAI_API_KEY is set on the server.',
    });
  }

  if (!Array.isArray(suggestions)) suggestions = [];
  const nameToRest = new Map(
    restaurantRows.rows.map((r) => [r.name.trim().toLowerCase(), r])
  );
  const restList = restaurantRows.rows;
  const matched = [];
  const usedIds = new Set();
  for (const s of suggestions) {
    const name = (s.name || '').trim();
    if (!name) continue;
    let rest = nameToRest.get(name.toLowerCase());
    if (!rest) {
      const lower = name.toLowerCase();
      rest = restList.find(
        (r) =>
          r.name &&
          (r.name.trim().toLowerCase() === lower ||
            r.name.trim().toLowerCase().includes(lower) ||
            lower.includes(r.name.trim().toLowerCase()))
      );
    }
    if (rest && !usedIds.has(rest.restaurant_id)) {
      usedIds.add(rest.restaurant_id);
      matched.push({ rest, reason: s.reason || 'Great for both of you' });
    }
  }
  const ids = matched.map((m) => m.rest.restaurant_id).filter(Boolean);
  const fullRows = ids.length
    ? await query(
        `SELECT restaurant_id, name, cuisine_type, price_range, city, address, rating
         FROM restaurants WHERE restaurant_id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };
  const byId = Object.fromEntries(fullRows.rows.map((r) => [r.restaurant_id, r]));
  const result = matched
    .filter((m) => byId[m.rest.restaurant_id])
    .map((m) => {
      const row = byId[m.rest.restaurant_id];
      return {
        restaurant_id: row.restaurant_id,
        name: row.name,
        cuisine_type: row.cuisine_type,
        price_range: row.price_range,
        city: row.city,
        address: row.address,
        rating: row.rating,
        reason: m.reason,
      };
    });

  res.json({ suggestions: result });
});

module.exports = { suggestForTwo };
