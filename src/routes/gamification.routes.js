const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ========== STREAKS API ==========

// Get user's current streak and stats
router.get('/streaks/my', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  
  const result = await query(
    `SELECT 
      current_streak,
      longest_streak,
      last_checkin_date,
      total_checkins,
      total_restaurants_visited,
      unique_cuisines,
      streak_start_date,
      updated_at
    FROM checkin_streaks
    WHERE user_id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return res.json({
      current_streak: 0,
      longest_streak: 0,
      last_checkin_date: null,
      total_checkins: 0,
      total_restaurants_visited: 0,
      unique_cuisines: 0,
      streak_start_date: null
    });
  }
  
  // Check if streak is still valid (not broken by time)
  const streak = result.rows[0];
  if (streak.last_checkin_date) {
    const lastCheckin = new Date(streak.last_checkin_date);
    const today = new Date();
    const daysDiff = Math.floor((today - lastCheckin) / (1000 * 60 * 60 * 24));
    
    // If more than 1 day passed, streak is at risk
    streak.streak_at_risk = daysDiff > 1;
    streak.days_until_break = Math.max(0, 2 - daysDiff);
  }
  
  res.json({ streak });
}));

// Get streak history
router.get('/streaks/history', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { limit = 30 } = req.query;
  
  const result = await query(
    `SELECT 
      streak_date,
      streak_number,
      streak_status,
      checkin_count
    FROM streak_history
    WHERE user_id = $1
    ORDER BY streak_date DESC
    LIMIT $2`,
    [userId, limit]
  );
  
  res.json({ history: result.rows });
}));

// ========== BADGES API ==========

// Get all available badges
router.get('/badges', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      badge_id,
      badge_code,
      name,
      description,
      icon_emoji,
      category,
      tier,
      requirement_type,
      requirement_value,
      color_hex,
      animation_type
    FROM badge_definitions
    ORDER BY category, tier, name`
  );
  
  res.json({ badges: result.rows });
}));

// Get user's earned badges
router.get('/badges/my', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  
  const result = await query(
    `SELECT 
      bd.badge_id,
      bd.badge_code,
      bd.name,
      bd.description,
      bd.icon_emoji,
      bd.category,
      bd.tier,
      bd.color_hex,
      bd.animation_type,
      ub.earned_at,
      ub.is_new,
      ub.viewed_at
    FROM user_badges ub
    JOIN badge_definitions bd ON ub.badge_id = bd.badge_id
    WHERE ub.user_id = $1
    ORDER BY ub.earned_at DESC`,
    [userId]
  );
  
  res.json({ badges: result.rows });
}));

// Mark badge as viewed (dismiss "new" notification)
router.patch('/badges/:badgeId/viewed', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { badgeId } = req.params;
  
  const result = await query(
    `UPDATE user_badges
    SET is_new = false,
        viewed_at = NOW()
    WHERE user_id = $1 AND badge_id = $2
    RETURNING *`,
    [userId, badgeId]
  );
  
  if (result.rows.length === 0) {
    throw new AppError('Badge not found', 404);
  }
  
  res.json({ 
    message: 'Badge marked as viewed',
    badge: result.rows[0]
  });
}));

// Check progress toward badges
router.get('/badges/progress', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  
  // Get user stats
  const statsResult = await query(
    `SELECT 
      COALESCE(cs.total_checkins, 0) as total_checkins,
      COALESCE(cs.current_streak, 0) as current_streak,
      COALESCE(cs.longest_streak, 0) as longest_streak,
      COUNT(DISTINCT ci.restaurant_id) as unique_venues,
      COUNT(DISTINCT r.cuisine_type) as unique_cuisines,
      COUNT(DISTINCT CASE WHEN r.venue_type IN ('bar', 'nightclub') THEN ci.restaurant_id END) as nightlife_venues
    FROM checkin_streaks cs
    LEFT JOIN check_ins ci ON cs.user_id = ci.user_id
    LEFT JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
    WHERE cs.user_id = $1
    GROUP BY cs.total_checkins, cs.current_streak, cs.longest_streak`,
    [userId]
  );
  
  const stats = statsResult.rows[0] || {
    total_checkins: 0,
    current_streak: 0,
    longest_streak: 0,
    unique_venues: 0,
    unique_cuisines: 0,
    nightlife_venues: 0
  };
  
  // Get match count
  const matchResult = await query(
    `SELECT COUNT(*) as match_count
    FROM matches
    WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
    [userId]
  );
  
  stats.match_count = parseInt(matchResult.rows[0].match_count);
  
  // Get badges with progress
  const progressResult = await query(
    `SELECT 
      bd.badge_id,
      bd.badge_code,
      bd.name,
      bd.description,
      bd.icon_emoji,
      bd.category,
      bd.tier,
      bd.requirement_type,
      bd.requirement_value,
      bd.color_hex,
      CASE 
        WHEN ub.badge_id IS NOT NULL THEN true
        ELSE false
      END as earned,
      ub.earned_at,
      CASE bd.requirement_type
        WHEN 'streak_days' THEN $2
        WHEN 'total_checkins' THEN $3
        WHEN 'unique_venues' THEN $4
        WHEN 'cuisines' THEN $5
        WHEN 'matches' THEN $6
        WHEN 'nightlife_checkins' THEN $7
        ELSE 0
      END as progress_current,
      bd.requirement_value as progress_target
    FROM badge_definitions bd
    LEFT JOIN user_badges ub ON bd.badge_id = ub.badge_id AND ub.user_id = $1
    ORDER BY bd.category, bd.tier`,
    [userId, stats.current_streak, stats.total_checkins, stats.unique_venues, 
     stats.unique_cuisines, stats.match_count, stats.nightlife_venues]
  );
  
  res.json({ 
    stats,
    badges: progressResult.rows
  });
}));

// ========== LEADERBOARD API ==========

// Get top streak leaders
router.get('/leaderboards/streaks', authenticateToken, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  const result = await query(
    `SELECT 
      u.user_id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      cs.current_streak,
      cs.longest_streak,
      cs.total_checkins
    FROM checkin_streaks cs
    JOIN users u ON cs.user_id = u.user_id
    ORDER BY cs.current_streak DESC, cs.longest_streak DESC
    LIMIT $1`,
    [limit]
  );
  
  res.json({ leaders: result.rows });
}));

// Get top badge collectors
router.get('/leaderboards/badges', authenticateToken, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  const result = await query(
    `SELECT 
      u.user_id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      COUNT(ub.badge_id) as badge_count
    FROM users u
    LEFT JOIN user_badges ub ON u.user_id = ub.user_id
    GROUP BY u.user_id, u.first_name, u.last_name, u.avatar_url
    ORDER BY badge_count DESC
    LIMIT $1`,
    [limit]
  );
  
  res.json({ leaders: result.rows });
}));

// Get user's rank
router.get('/leaderboards/my-rank', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  
  // Streak rank
  const streakRank = await query(
    `SELECT COUNT(*) + 1 as rank
    FROM checkin_streaks
    WHERE current_streak > (SELECT current_streak FROM checkin_streaks WHERE user_id = $1)`,
    [userId]
  );
  
  // Badge rank
  const badgeRank = await query(
    `SELECT COUNT(*) + 1 as rank
    FROM (
      SELECT user_id, COUNT(*) as badge_count
      FROM user_badges
      GROUP BY user_id
    ) counts
    WHERE badge_count > (
      SELECT COUNT(*) FROM user_badges WHERE user_id = $1
    )`,
    [userId]
  );
  
  res.json({
    streak_rank: parseInt(streakRank.rows[0].rank),
    badge_rank: parseInt(badgeRank.rows[0].rank)
  });
}));

module.exports = router;
