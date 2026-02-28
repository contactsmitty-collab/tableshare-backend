const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const pointsService = require('../services/pointsService');

// Get user's point balance
const getMyPoints = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const points = await pointsService.getUserPoints(userId);
  
  res.json({
    points: points,
  });
});

// Get point transaction history
const getPointHistory = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const history = await pointsService.getPointHistory(userId, limit, offset);

  res.json({
    transactions: history,
    limit,
    offset,
  });
});

// Get leaderboard
const getLeaderboard = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const period = req.query.period || 'all_time'; // 'all_time' or 'current'

  if (period !== 'all_time' && period !== 'current') {
    throw new AppError('Invalid period. Use "all_time" or "current"', 400);
  }

  const leaderboard = await pointsService.getLeaderboard(limit, period);

  res.json({
    leaderboard,
    period,
    limit,
  });
});

// Get user's rank
const getMyRank = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const period = req.query.period || 'all_time';

  // Get user's points
  const userPoints = await pointsService.getUserPoints(userId);
  const pointsValue = period === 'all_time' ? userPoints.lifetime_points : userPoints.total_points;

  // Count users with more points
  const orderBy = period === 'all_time' ? 'lifetime_points' : 'total_points';
  const rankResult = await query(
    `SELECT COUNT(*) + 1 as rank
     FROM user_points
     WHERE ${orderBy} > $1`,
    [pointsValue]
  );

  const rank = parseInt(rankResult.rows[0].rank);

  res.json({
    rank,
    points: pointsValue,
    period,
  });
});

module.exports = {
  getMyPoints,
  getPointHistory,
  getLeaderboard,
  getMyRank,
};
