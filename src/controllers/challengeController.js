/**
 * Challenge Controller
 * Handles social challenges system
 */

const { query } = require('../config/database');

// Get all active challenges
const getActiveChallenges = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { scope = 'global', city } = req.query;
    
    let sql = `
      SELECT 
        ac.*,
        ct.icon_url,
        ct.color_theme,
        COUNT(cp.participant_id) as participant_count,
        COUNT(CASE WHEN cp.status = 'completed' THEN 1 END) as completed_count,
        EXISTS(
          SELECT 1 FROM challenge_participants 
          WHERE challenge_id = ac.challenge_id AND user_id = $1
        ) as user_participating,
        (
          SELECT current_progress FROM challenge_participants
          WHERE challenge_id = ac.challenge_id AND user_id = $1
        ) as user_progress
      FROM active_challenges ac
      LEFT JOIN challenge_templates ct ON ac.template_id = ct.template_id
      LEFT JOIN challenge_participants cp ON ac.challenge_id = cp.challenge_id
      WHERE ac.status = 'active'
      AND ac.end_date > NOW()
    `;
    
    const params = [userId];
    
    if (scope !== 'all') {
      sql += ` AND ac.scope = $${params.length + 1}`;
      params.push(scope);
    }
    
    if (city) {
      sql += ` AND ac.scope_city = $${params.length + 1}`;
      params.push(city);
    }
    
    sql += ` GROUP BY ac.challenge_id, ct.icon_url, ct.color_theme
             ORDER BY ac.featured DESC, ac.created_at DESC`;
    
    const result = await query(sql, params);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching active challenges:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch challenges'
    });
  }
};

// Get challenge details with leaderboard
const getChallengeDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.params;
    
    // Get challenge details
    const challengeResult = await query(
      `SELECT ac.*, ct.icon_url, ct.color_theme, ct.challenge_type
       FROM active_challenges ac
       LEFT JOIN challenge_templates ct ON ac.template_id = ct.template_id
       WHERE ac.challenge_id = $1`,
      [challengeId]
    );
    
    if (challengeResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Challenge not found'
      });
    }
    
    // Get leaderboard
    const leaderboardResult = await query(
      `SELECT 
        cl.*,
        CASE WHEN cl.user_id = $1 THEN true ELSE false END as is_current_user
       FROM challenge_leaderboard cl
       WHERE cl.challenge_id = $2
       ORDER BY cl.current_rank ASC
       LIMIT 50`,
      [userId, challengeId]
    );
    
    // Get user's participation status
    const userStatusResult = await query(
      `SELECT * FROM challenge_participants
       WHERE challenge_id = $1 AND user_id = $2`,
      [challengeId, userId]
    );
    
    res.json({
      status: 'success',
      data: {
        challenge: challengeResult.rows[0],
        leaderboard: leaderboardResult.rows,
        user_status: userStatusResult.rows[0] || null,
        time_remaining: calculateTimeRemaining(challengeResult.rows[0].end_date)
      }
    });
  } catch (error) {
    console.error('Error fetching challenge details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch challenge details'
    });
  }
};

// Join a challenge
const joinChallenge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.params;
    
    const result = await query(
      `SELECT * FROM join_challenge($1, $2)`,
      [userId, challengeId]
    );
    
    const { success, message, participant_id } = result.rows[0];
    
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
        participant_id: participant_id
      }
    });
  } catch (error) {
    console.error('Error joining challenge:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to join challenge'
    });
  }
};

// Leave/withdraw from a challenge
const leaveChallenge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.params;
    
    const result = await query(
      `UPDATE challenge_participants
       SET status = 'withdrawn', last_updated_at = NOW()
       WHERE challenge_id = $1 AND user_id = $2
       RETURNING *`,
      [challengeId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Not participating in this challenge'
      });
    }
    
    res.json({
      status: 'success',
      message: 'Left challenge successfully'
    });
  } catch (error) {
    console.error('Error leaving challenge:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to leave challenge'
    });
  }
};

// Get user's challenge history and stats
const getMyChallenges = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user's challenge stats
    const statsResult = await query(
      `SELECT * FROM user_challenge_stats WHERE user_id = $1`,
      [userId]
    );
    
    // Get active challenges the user is participating in
    const activeResult = await query(
      `SELECT 
        ac.*,
        cp.current_progress,
        cp.progress_percentage,
        cp.status as participant_status,
        ct.icon_url,
        ct.color_theme,
        (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = ac.challenge_id) as total_participants,
        (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = ac.challenge_id AND status = 'completed') as completed_count
       FROM challenge_participants cp
       JOIN active_challenges ac ON cp.challenge_id = ac.challenge_id
       LEFT JOIN challenge_templates ct ON ac.template_id = ct.template_id
       WHERE cp.user_id = $1
       AND ac.status = 'active'
       AND cp.status != 'withdrawn'
       ORDER BY ac.end_date ASC`,
      [userId]
    );
    
    // Get completed challenges
    const completedResult = await query(
      `SELECT 
        ac.*,
        cp.completed_at,
        cp.rank_achieved,
        ct.icon_url,
        ct.color_theme,
        (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = ac.challenge_id) as total_participants
       FROM challenge_participants cp
       JOIN active_challenges ac ON cp.challenge_id = ac.challenge_id
       LEFT JOIN challenge_templates ct ON ac.template_id = ct.template_id
       WHERE cp.user_id = $1
       AND cp.status = 'completed'
       ORDER BY cp.completed_at DESC
       LIMIT 10`,
      [userId]
    );
    
    res.json({
      status: 'success',
      data: {
        stats: statsResult.rows[0] || {
          total_challenges_joined: 0,
          total_challenges_completed: 0,
          total_challenge_points_earned: 0
        },
        active: activeResult.rows,
        completed: completedResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching user challenges:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch challenges'
    });
  }
};

// Get challenge templates (for creating new challenges)
const getChallengeTemplates = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM challenge_templates 
       WHERE is_active = true
       ORDER BY challenge_type, name`
    );
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching challenge templates:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch templates'
    });
  }
};

// Create a new challenge (admin or restaurant owner)
const createChallenge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      template_id,
      name,
      description,
      start_date,
      end_date,
      scope = 'global',
      scope_city,
      restaurant_id,
      goal_metric,
      goal_value,
      points_reward,
      featured = false
    } = req.body;
    
    // If using a template, get the template details
    let template;
    if (template_id) {
      const templateResult = await query(
        `SELECT * FROM challenge_templates WHERE template_id = $1`,
        [template_id]
      );
      template = templateResult.rows[0];
    }
    
    const result = await query(
      `INSERT INTO active_challenges (
        template_id, name, description, start_date, end_date,
        scope, scope_city, restaurant_id,
        goal_metric, goal_value, points_reward, featured,
        created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
      RETURNING *`,
      [
        template_id,
        name || template?.name,
        description || template?.description,
        start_date || 'NOW()',
        end_date || 'NOW() + INTERVAL \'7 days\'',
        scope,
        scope_city,
        restaurant_id,
        goal_metric || template?.goal_metric,
        goal_value || template?.goal_value,
        points_reward || template?.points_reward || 100,
        featured,
        userId
      ]
    );
    
    res.status(201).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create challenge'
    });
  }
};

// Invite friends to a challenge
const inviteToChallenge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.params;
    const { invited_user_id, message } = req.body;
    
    // Check if already invited or participating
    const existingResult = await query(
      `SELECT 1 FROM challenge_invitations 
       WHERE challenge_id = $1 AND invited_user_id = $2
       UNION
       SELECT 1 FROM challenge_participants
       WHERE challenge_id = $1 AND user_id = $2`,
      [challengeId, invited_user_id]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'User already invited or participating'
      });
    }
    
    const result = await query(
      `INSERT INTO challenge_invitations (
        challenge_id, invited_by, invited_user_id, message
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [challengeId, userId, invited_user_id, message]
    );
    
    res.json({
      status: 'success',
      message: 'Invitation sent',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error inviting to challenge:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send invitation'
    });
  }
};

// Respond to challenge invitation
const respondToInvitation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { invitationId } = req.params;
    const { accept } = req.body;
    
    // Update invitation status
    const invitationResult = await query(
      `UPDATE challenge_invitations
       SET status = $1, responded_at = NOW()
       WHERE invitation_id = $2 AND invited_user_id = $3
       RETURNING challenge_id`,
      [accept ? 'accepted' : 'declined', invitationId, userId]
    );
    
    if (invitationResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Invitation not found'
      });
    }
    
    // If accepted, join the challenge
    if (accept) {
      const challengeId = invitationResult.rows[0].challenge_id;
      await query(
        `SELECT * FROM join_challenge($1, $2)`,
        [userId, challengeId]
      );
    }
    
    res.json({
      status: 'success',
      message: accept ? 'Joined challenge' : 'Declined invitation'
    });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to respond to invitation'
    });
  }
};

// Get pending challenge invitations
const getMyInvitations = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await query(
      `SELECT 
        ci.*,
        ac.name as challenge_name,
        ac.description as challenge_description,
        ac.end_date,
        u.first_name as inviter_first_name,
        u.last_name as inviter_last_name,
        u.avatar_url as inviter_avatar
       FROM challenge_invitations ci
       JOIN active_challenges ac ON ci.challenge_id = ac.challenge_id
       JOIN users u ON ci.invited_by = u.user_id
       WHERE ci.invited_user_id = $1
       AND ci.status = 'pending'
       AND ac.status = 'active'
       AND ac.end_date > NOW()
       ORDER BY ci.created_at DESC`,
      [userId]
    );
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch invitations'
    });
  }
};

// Helper function
function calculateTimeRemaining(endDate) {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;
  
  if (diff <= 0) return 'Ended';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }
  return `${hours}h remaining`;
}

module.exports = {
  getActiveChallenges,
  getChallengeDetails,
  joinChallenge,
  leaveChallenge,
  getMyChallenges,
  getChallengeTemplates,
  createChallenge,
  inviteToChallenge,
  respondToInvitation,
  getMyInvitations
};
