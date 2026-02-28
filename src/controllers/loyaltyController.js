/**
 * Loyalty Controller
 * Handles venue loyalty points programs
 */

const { query } = require('../config/database');

// Get all loyalty programs (for discovery)
const getAllLoyaltyPrograms = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    
    let sql = `
      SELECT 
        vlp.*,
        r.name as restaurant_name,
        r.photo_url as restaurant_photo,
        r.cuisine_type,
        r.address,
        r.latitude,
        r.longitude,
        COUNT(DISTINCT uvl.user_id) as total_members
      FROM venue_loyalty_programs vlp
      JOIN restaurants r ON vlp.restaurant_id = r.restaurant_id
      LEFT JOIN user_venue_loyalty uvl ON vlp.restaurant_id = uvl.restaurant_id
      WHERE vlp.is_active = true
    `;
    
    const params = [];
    
    // Add location filter if provided
    if (latitude && longitude) {
      sql += ` AND (
        6371 * acos(
          cos(radians($${params.length + 1})) * cos(radians(r.latitude)) *
          cos(radians(r.longitude) - radians($${params.length + 2})) +
          sin(radians($${params.length + 1})) * sin(radians(r.latitude))
        )
      ) <= $${params.length + 3}`;
      params.push(latitude, longitude, radius);
    }
    
    sql += ` GROUP BY vlp.program_id, r.name, r.photo_url, r.cuisine_type, r.address, r.latitude, r.longitude`;
    
    const result = await query(sql, params);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching loyalty programs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch loyalty programs'
    });
  }
};

// Get user's loyalty programs and status
const getMyLoyaltyPrograms = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const sql = `
      SELECT * FROM user_venue_loyalty_summary
      WHERE user_id = $1
      ORDER BY total_points_earned DESC
    `;
    
    const result = await query(sql, [userId]);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching user loyalty programs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch loyalty programs'
    });
  }
};

// Get detailed loyalty status for a specific venue
const getVenueLoyaltyStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    
    // Get loyalty summary
    const loyaltyResult = await query(
      `SELECT * FROM user_venue_loyalty_summary
       WHERE user_id = $1 AND restaurant_id = $2`,
      [userId, restaurantId]
    );
    
    // Get transaction history
    const transactionsResult = await query(
      `SELECT 
        lt.*,
        r.name as restaurant_name
       FROM loyalty_transactions lt
       JOIN restaurants r ON lt.restaurant_id = r.restaurant_id
       WHERE lt.user_id = $1 AND lt.restaurant_id = $2
       ORDER BY lt.created_at DESC
       LIMIT 50`,
      [userId, restaurantId]
    );
    
    // Get available benefits at current tier
    let benefitsResult = { rows: [] };
    if (loyaltyResult.rows.length > 0) {
      benefitsResult = await query(
        `SELECT * FROM available_tier_benefits
         WHERE program_id = $1 
         AND tier = $2
         AND is_active = true
         ORDER BY benefit_name`,
        [loyaltyResult.rows[0].program_id, loyaltyResult.rows[0].current_tier]
      );
    }
    
    // Get active promotions
    const promotionsResult = await query(
      `SELECT * FROM loyalty_promotions
       WHERE restaurant_id = $1
       AND is_active = true
       AND start_date <= NOW()
       AND end_date >= NOW()`,
      [restaurantId]
    );
    
    res.json({
      status: 'success',
      data: {
        loyalty: loyaltyResult.rows[0] || null,
        transactions: transactionsResult.rows,
        available_benefits: benefitsResult.rows,
        active_promotions: promotionsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching venue loyalty status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch loyalty status'
    });
  }
};

// Join a loyalty program (triggered automatically on first check-in)
const joinLoyaltyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    
    // Check if program exists
    const programResult = await query(
      `SELECT * FROM venue_loyalty_programs
       WHERE restaurant_id = $1 AND is_active = true`,
      [restaurantId]
    );
    
    if (programResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No active loyalty program at this restaurant'
      });
    }
    
    const program = programResult.rows[0];
    
    // Check if already joined
    const existingResult = await query(
      `SELECT * FROM user_venue_loyalty
       WHERE user_id = $1 AND restaurant_id = $2`,
      [userId, restaurantId]
    );
    
    if (existingResult.rows.length > 0) {
      return res.json({
        status: 'success',
        message: 'Already joined this loyalty program',
        data: existingResult.rows[0]
      });
    }
    
    // Award welcome bonus
    const welcomeResult = await query(
      `SELECT * FROM award_loyalty_points($1, $2, 'welcome_bonus', $3, 'Welcome bonus for joining')`,
      [userId, restaurantId, program.welcome_bonus_points]
    );
    
    res.json({
      status: 'success',
      message: `Welcome to ${program.program_name}!`,
      data: {
        points_earned: welcomeResult.rows[0].points_earned,
        tier: welcomeResult.rows[0].new_tier,
        tier_name: 'Foodie'
      }
    });
  } catch (error) {
    console.error('Error joining loyalty program:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to join loyalty program'
    });
  }
};

// Redeem points for a reward
const redeemPoints = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    const { points_to_redeem, reward_description } = req.body;
    
    const result = await query(
      `SELECT * FROM redeem_loyalty_points($1, $2, $3, $4)`,
      [userId, restaurantId, points_to_redeem, reward_description]
    );
    
    const { success, new_balance, message } = result.rows[0];
    
    if (!success) {
      return res.status(400).json({
        status: 'error',
        message: message
      });
    }
    
    res.json({
      status: 'success',
      message: message,
      data: {
        points_redeemed: points_to_redeem,
        new_balance: new_balance
      }
    });
  } catch (error) {
    console.error('Error redeeming points:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to redeem points'
    });
  }
};

// Get loyalty leaderboard for a venue
const getVenueLoyaltyLeaderboard = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { limit = 10 } = req.query;
    
    const result = await query(
      `SELECT 
        uvl.user_id,
        u.first_name,
        u.last_name,
        u.avatar_url,
        uvl.total_points_earned,
        uvl.current_tier,
        uvl.total_visits,
        ROW_NUMBER() OVER (ORDER BY uvl.total_points_earned DESC) as rank
       FROM user_venue_loyalty uvl
       JOIN users u ON uvl.user_id = u.user_id
       WHERE uvl.restaurant_id = $1
       ORDER BY uvl.total_points_earned DESC
       LIMIT $2`,
      [restaurantId, limit]
    );
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching loyalty leaderboard:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch leaderboard'
    });
  }
};

// Award points manually (for staff/admin)
const awardPointsManual = async (req, res) => {
  try {
    const staffId = req.user.userId;
    const { userId, restaurantId } = req.params;
    const { points, description, transaction_type = 'manual' } = req.body;
    
    // Verify staff has permission (would need proper staff verification)
    // For now, we'll trust the authenticated user
    
    const result = await query(
      `SELECT * FROM award_loyalty_points($1, $2, $3, $4, $5)`,
      [userId, restaurantId, transaction_type, points, description]
    );
    
    res.json({
      status: 'success',
      message: `${points} points awarded successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error awarding points:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to award points'
    });
  }
};

// Create/update loyalty program (restaurant admin)
const createLoyaltyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    const {
      program_name,
      points_per_visit,
      points_per_dollar,
      welcome_bonus_points,
      checkin_bonus_points,
      tier_1_name,
      tier_2_name,
      tier_3_name,
      tier_4_name,
      tier_2_threshold,
      tier_3_threshold,
      tier_4_threshold,
      tier_1_benefits,
      tier_2_benefits,
      tier_3_benefits,
      tier_4_benefits,
      redemption_enabled,
      points_per_reward,
      reward_description
    } = req.body;
    
    // TODO: Verify user is restaurant owner/manager
    
    const result = await query(
      `INSERT INTO venue_loyalty_programs (
        restaurant_id, program_name, points_per_visit, points_per_dollar,
        welcome_bonus_points, checkin_bonus_points,
        tier_1_name, tier_2_name, tier_3_name, tier_4_name,
        tier_2_threshold, tier_3_threshold, tier_4_threshold,
        tier_1_benefits, tier_2_benefits, tier_3_benefits, tier_4_benefits,
        redemption_enabled, points_per_reward, reward_description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (restaurant_id)
      DO UPDATE SET
        program_name = EXCLUDED.program_name,
        points_per_visit = EXCLUDED.points_per_visit,
        points_per_dollar = EXCLUDED.points_per_dollar,
        welcome_bonus_points = EXCLUDED.welcome_bonus_points,
        checkin_bonus_points = EXCLUDED.checkin_bonus_points,
        tier_1_name = EXCLUDED.tier_1_name,
        tier_2_name = EXCLUDED.tier_2_name,
        tier_3_name = EXCLUDED.tier_3_name,
        tier_4_name = EXCLUDED.tier_4_name,
        tier_2_threshold = EXCLUDED.tier_2_threshold,
        tier_3_threshold = EXCLUDED.tier_3_threshold,
        tier_4_threshold = EXCLUDED.tier_4_threshold,
        tier_1_benefits = EXCLUDED.tier_1_benefits,
        tier_2_benefits = EXCLUDED.tier_2_benefits,
        tier_3_benefits = EXCLUDED.tier_3_benefits,
        tier_4_benefits = EXCLUDED.tier_4_benefits,
        redemption_enabled = EXCLUDED.redemption_enabled,
        points_per_reward = EXCLUDED.points_per_reward,
        reward_description = EXCLUDED.reward_description,
        updated_at = NOW()
      RETURNING *`,
      [
        restaurantId, program_name, points_per_visit, points_per_dollar,
        welcome_bonus_points, checkin_bonus_points,
        tier_1_name, tier_2_name, tier_3_name, tier_4_name,
        tier_2_threshold, tier_3_threshold, tier_4_threshold,
        tier_1_benefits, tier_2_benefits, tier_3_benefits, tier_4_benefits,
        redemption_enabled, points_per_reward, reward_description
      ]
    );
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating loyalty program:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create loyalty program'
    });
  }
};

module.exports = {
  getAllLoyaltyPrograms,
  getMyLoyaltyPrograms,
  getVenueLoyaltyStatus,
  joinLoyaltyProgram,
  redeemPoints,
  getVenueLoyaltyLeaderboard,
  awardPointsManual,
  createLoyaltyProgram
};
