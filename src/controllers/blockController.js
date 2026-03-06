const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const blockUser = asyncHandler(async (req, res) => {
  const blockerId = req.user.userId;
  const blockedId = req.params.userId;
  if (blockedId === blockerId) {
    throw new AppError('You cannot block yourself', 400);
  }
  await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId]
  );
  res.status(201).json({ success: true, message: 'User blocked' });
});

const unblockUser = asyncHandler(async (req, res) => {
  const blockerId = req.user.userId;
  const blockedId = req.params.userId;
  const result = await query(
    `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id`,
    [blockerId, blockedId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Block not found or already removed', 404);
  }
  res.json({ success: true, message: 'User unblocked' });
});

const getBlockedUsers = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT ub.blocked_id as user_id, u.first_name, u.last_name, u.profile_photo_url
     FROM user_blocks ub
     JOIN users u ON u.user_id = ub.blocked_id
     WHERE ub.blocker_id = $1
     ORDER BY ub.created_at DESC`,
    [userId]
  );
  res.json({
    blocked: result.rows.map((r) => ({
      userId: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      profile_photo_url: r.profile_photo_url,
    })),
  });
});

module.exports = { blockUser, unblockUser, getBlockedUsers };
