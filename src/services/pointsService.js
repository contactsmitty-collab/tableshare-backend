const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Award points to a user
 * @param {string} userId - User ID
 * @param {string} transactionType - Type of transaction (check_in, group_create, etc.)
 * @param {number} points - Points to award (if null, will look up from point_rules)
 * @param {string} referenceId - Optional reference ID (check_in_id, group_id, etc.)
 * @param {string} description - Optional description
 * @returns {Promise<Object>} Transaction details
 */
async function awardPoints(userId, transactionType, points = null, referenceId = null, description = null) {
  try {
    // If points not specified, look up from point_rules
    if (points === null) {
      const ruleResult = await query(
        'SELECT points FROM point_rules WHERE rule_type = $1 AND is_active = TRUE',
        [transactionType]
      );
      
      if (ruleResult.rows.length === 0) {
        console.warn(`No point rule found for type: ${transactionType}`);
        return null; // No points to award
      }
      
      points = ruleResult.rows[0].points;
    }

    // Create transaction
    const transactionResult = await query(
      `INSERT INTO point_transactions (user_id, points, transaction_type, reference_id, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING transaction_id, created_at`,
      [userId, points, transactionType, referenceId, description || `${transactionType}: +${points} points`]
    );

    // Update or insert user_points
    await query(
      `INSERT INTO user_points (user_id, total_points, lifetime_points)
       VALUES ($1, $2, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         total_points = user_points.total_points + $2,
         lifetime_points = user_points.lifetime_points + $2,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, points]
    );

    return {
      transaction_id: transactionResult.rows[0].transaction_id,
      points: points,
      transaction_type: transactionType,
      created_at: transactionResult.rows[0].created_at,
    };
  } catch (error) {
    console.error('Error awarding points:', error);
    // Don't throw - points are nice to have but shouldn't break main functionality
    return null;
  }
}

/**
 * Get user's current point balance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User points info
 */
async function getUserPoints(userId) {
  const result = await query(
    `SELECT 
      total_points, 
      lifetime_points, 
      current_streak, 
      longest_streak,
      last_check_in_date
     FROM user_points
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    // Initialize if doesn't exist
    await query(
      'INSERT INTO user_points (user_id) VALUES ($1)',
      [userId]
    );
    return {
      total_points: 0,
      lifetime_points: 0,
      current_streak: 0,
      longest_streak: 0,
      last_check_in_date: null,
    };
  }

  return result.rows[0];
}

/**
 * Update check-in streak using gamification system
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated streak info and any new badges
 */
async function updateCheckInStreak(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Use the database function to update streak in new gamification system
    const result = await query(
      'SELECT * FROM update_checkin_streak($1, $2)',
      [userId, today]
    );
    
    const { out_current_streak, out_longest_streak, out_is_new_badge, out_new_badge_code } = result.rows[0];
    
    const current_streak = out_current_streak;
    const longest_streak = out_longest_streak;
    const is_new_badge = out_is_new_badge;
    const new_badge_code = out_new_badge_code;
    
    // Also update legacy user_points for backward compatibility
    await query(
      `INSERT INTO user_points (user_id, current_streak, longest_streak, last_check_in_date)
       VALUES ($1, $2, GREATEST($2, COALESCE((SELECT longest_streak FROM user_points WHERE user_id = $1), 0)), $3)
       ON CONFLICT (user_id)
       DO UPDATE SET
         current_streak = $2,
         longest_streak = GREATEST($2, user_points.longest_streak),
         last_check_in_date = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, current_streak, today]
    );
    
    // Check for other badges (explorer, foodie, social, etc.)
    const badgeResult = await query(
      'SELECT * FROM check_and_award_badges($1)',
      [userId]
    );
    
    const newBadges = [];
    if (is_new_badge && new_badge_code) {
      newBadges.push({ code: new_badge_code, name: 'Streak Badge' });
    }
    
    // Add any other newly earned badges
    badgeResult.rows.forEach(badge => {
      newBadges.push({ code: badge.badge_code, name: badge.badge_name });
    });
    
    // Award points for streak milestones
    const bonuses = [];
    if (current_streak === 3) {
      const bonus = await awardPoints(userId, 'streak_3', 50, null, '3-day check-in streak!');
      if (bonus) bonuses.push(bonus);
    } else if (current_streak === 7) {
      const bonus = await awardPoints(userId, 'streak_7', 100, null, '7-day check-in streak!');
      if (bonus) bonuses.push(bonus);
    } else if (current_streak === 14) {
      const bonus = await awardPoints(userId, 'streak_14', 200, null, '14-day check-in streak!');
      if (bonus) bonuses.push(bonus);
    } else if (current_streak === 30) {
      const bonus = await awardPoints(userId, 'streak_30', 500, null, '30-day check-in streak!');
      if (bonus) bonuses.push(bonus);
    }
    
    // Award points for badges
    if (newBadges.length > 0) {
      for (const badge of newBadges) {
        const badgePoints = await awardPoints(
          userId, 
          'badge_earned', 
          25, 
          null, 
          `Earned badge: ${badge.name}`
        );
        if (badgePoints) bonuses.push(badgePoints);
      }
    }

    return {
      current_streak,
      longest_streak,
      newBadges,
      bonuses,
      streakMaintained: true,
      streakBroken: false
    };
  } catch (error) {
    console.error('Error updating check-in streak:', error);
    // Don't throw - streak tracking shouldn't break check-ins
    return { current_streak: 0, longest_streak: 0, newBadges: [], bonuses: [] };
  }
}

/**
 * Get point transaction history
 * @param {string} userId - User ID
 * @param {number} limit - Number of transactions to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Transaction history
 */
async function getPointHistory(userId, limit = 50, offset = 0) {
  const result = await query(
    `SELECT 
      transaction_id,
      points,
      transaction_type,
      reference_id,
      description,
      created_at
     FROM point_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

/**
 * Get leaderboard
 * @param {number} limit - Number of users to return
 * @param {string} period - 'all_time' or 'current' (default: 'all_time')
 * @returns {Promise<Array>} Leaderboard entries
 */
async function getLeaderboard(limit = 100, period = 'all_time') {
  let orderBy = 'lifetime_points DESC';
  if (period === 'current') {
    orderBy = 'total_points DESC';
  }

  const result = await query(
    `SELECT 
      up.user_id,
      u.first_name || ' ' || u.last_name as user_name,
      u.profile_photo_url,
      up.total_points,
      up.lifetime_points,
      up.current_streak,
      up.longest_streak,
      ROW_NUMBER() OVER (ORDER BY ${orderBy}) as rank
     FROM user_points up
     JOIN users u ON up.user_id = u.user_id
     ORDER BY ${orderBy}
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

/**
 * Award venue loyalty points on check-in
 * @param {string} userId - User ID
 * @param {string} restaurantId - Restaurant ID
 * @param {string} checkInId - Check-in ID
 * @returns {Promise<Object>} Loyalty points awarded
 */
async function awardVenueLoyaltyPoints(userId, restaurantId, checkInId) {
  try {
    // Check if restaurant has an active loyalty program
    const programResult = await query(
      `SELECT * FROM venue_loyalty_programs
       WHERE restaurant_id = $1 AND is_active = true`,
      [restaurantId]
    );
    
    if (programResult.rows.length === 0) {
      return null; // No loyalty program
    }
    
    const program = programResult.rows[0];
    
    // Calculate points to award (checkin bonus + base points)
    const pointsToAward = program.checkin_bonus_points + program.points_per_visit;
    
    // Award points using the database function
    const result = await query(
      `SELECT * FROM award_loyalty_points($1, $2, 'checkin', $3, 'Check-in bonus at ' || (SELECT name FROM restaurants WHERE restaurant_id = $2), $4)`,
      [userId, restaurantId, pointsToAward, checkInId]
    );
    
    const { new_total_points, new_tier, tier_upgraded, points_earned } = result.rows[0];
    
    return {
      program_id: program.program_id,
      program_name: program.program_name,
      points_earned: points_earned,
      total_points: new_total_points,
      current_tier: new_tier,
      tier_upgraded: tier_upgraded,
      tier_name: getTierName(program, new_tier)
    };
  } catch (error) {
    console.error('Error awarding venue loyalty points:', error);
    // Don't throw - loyalty points are nice to have but shouldn't break check-ins
    return null;
  }
}

/**
 * Update challenge progress when user performs an action
 * @param {string} userId - User ID
 * @param {string} actionType - Type of action (checkin, match_accepted, group_joined)
 * @param {string} actionReference - ID of the triggering action
 * @returns {Promise<Object>} Challenges updated and completed
 */
async function updateChallengeProgress(userId, actionType, actionReference) {
  try {
    const result = await query(
      `SELECT * FROM update_challenge_progress($1, $2, $3)`,
      [userId, actionType, actionReference]
    );
    
    const { challenges_updated, completed_challenges } = result.rows[0];
    
    // Award points for each completed challenge
    if (completed_challenges && completed_challenges.length > 0) {
      for (const challengeName of completed_challenges) {
        await awardPoints(
          userId,
          'challenge_completed',
          100,
          null,
          `Completed challenge: ${challengeName}`
        );
      }
    }
    
    return {
      challenges_updated: challenges_updated || 0,
      completed_challenges: completed_challenges || []
    };
  } catch (error) {
    console.error('Error updating challenge progress:', error);
    // Don't throw - challenge progress shouldn't break main functionality
    return { challenges_updated: 0, completed_challenges: [] };
  }
}

/**
 * Get tier name based on tier number
 */
function getTierName(program, tier) {
  switch (tier) {
    case 1: return program.tier_1_name;
    case 2: return program.tier_2_name;
    case 3: return program.tier_3_name;
    case 4: return program.tier_4_name;
    default: return 'Member';
  }
}

module.exports = {
  awardPoints,
  getUserPoints,
  updateCheckInStreak,
  getPointHistory,
  getLeaderboard,
  awardVenueLoyaltyPoints,
  updateChallengeProgress,
};
