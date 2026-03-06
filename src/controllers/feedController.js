const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

const getFeed = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const offset = parseInt(req.query.offset, 10) || 0;

  const result = await query(
    `WITH my_matches AS (
       SELECT (CASE WHEN m.requester_id = $1 THEN m.receiver_id ELSE m.requester_id END) AS friend_id
       FROM matches m
       WHERE (m.requester_id = $1 OR m.receiver_id = $1) AND m.status IN ('accepted', 'completed')
     ),
     blocked AS (
       SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
       UNION
       SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = $1
     )
     SELECT
       a.activity_id,
       a.user_id,
       a.type,
       a.target_type,
       a.target_id,
       a.metadata,
       a.created_at,
       u.first_name,
       u.last_name,
       u.profile_photo_url,
       r.restaurant_id,
       r.name AS restaurant_name,
       r.photo_url AS restaurant_photo_url,
       r.city AS restaurant_city
     FROM activities a
     JOIN users u ON u.user_id = a.user_id
     LEFT JOIN user_activity_preferences pref ON pref.user_id = a.user_id
     LEFT JOIN restaurants r ON r.restaurant_id = a.target_id AND a.target_type = 'restaurant'
     WHERE a.user_id IN (SELECT friend_id FROM my_matches)
       AND a.user_id NOT IN (SELECT id FROM blocked)
       AND (pref.user_id IS NULL OR pref.show_my_activity = true)
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const activities = result.rows.map((row) => ({
    activity_id: row.activity_id,
    user_id: row.user_id,
    type: row.type,
    target_type: row.target_type,
    target_id: row.target_id,
    metadata: row.metadata,
    created_at: row.created_at,
    user: {
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_photo_url: row.profile_photo_url,
    },
    restaurant: row.restaurant_id
      ? {
          restaurant_id: row.restaurant_id,
          name: row.restaurant_name,
          photo_url: row.restaurant_photo_url,
          city: row.restaurant_city,
        }
      : null,
  }));

  res.json({ activities, has_more: activities.length === limit });
});

module.exports = { getFeed };
