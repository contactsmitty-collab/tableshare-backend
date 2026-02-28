const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const { computeCompatibilityScore } = require('../utils/compatibilityScore');

// Get user's matches (sorted by compatibility score)
const getMyMatches = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      m.match_id, m.status, m.created_at,
      u1.first_name as requester_first_name,
      u2.first_name as receiver_first_name,
      CASE WHEN m.requester_id = $1 THEN m.receiver_id ELSE m.requester_id END as other_user_id,
      CASE WHEN m.requester_id = $1 THEN u2.first_name ELSE u1.first_name END as other_user_first_name,
      CASE WHEN m.requester_id = $1 THEN u2.last_name ELSE u1.last_name END as other_user_last_name,
      CASE WHEN m.requester_id = $1 THEN u2.conversation_preference ELSE u1.conversation_preference END as other_conversation_preference,
      CASE WHEN m.requester_id = $1 THEN u2.dietary_tags ELSE u1.dietary_tags END as other_dietary_tags,
      r.restaurant_id, r.name as restaurant_name
     FROM matches m
     JOIN restaurants r ON m.restaurant_id = r.restaurant_id
     LEFT JOIN users u1 ON m.requester_id = u1.user_id
     LEFT JOIN users u2 ON m.receiver_id = u2.user_id
     WHERE (m.requester_id = $1 OR m.receiver_id = $1)
       AND m.status IN ('accepted', 'completed')
     ORDER BY m.created_at DESC`,
    [userId]
  );

  const myProfileResult = await query(
    'SELECT conversation_preference, dietary_tags FROM users WHERE user_id = $1',
    [userId]
  );
  const myProfile = myProfileResult.rows[0] || { conversation_preference: 'flexible', dietary_tags: null };

  const matchesWithScore = result.rows.map(row => {
    const otherProfile = {
      conversation_preference: row.other_conversation_preference,
      dietary_tags: row.other_dietary_tags,
    };
    const compatibility_score = computeCompatibilityScore(myProfile, otherProfile);
    return {
      match_id: row.match_id,
      requester_first_name: row.requester_first_name,
      receiver_first_name: row.receiver_first_name,
      receiver_id: row.other_user_id,
      restaurant_name: row.restaurant_name,
      status: row.status,
      restaurantId: row.restaurant_id,
      compatibility_score,
    };
  });

  matchesWithScore.sort((a, b) => (b.compatibility_score || 0) - (a.compatibility_score || 0));

  res.json({
    matches: matchesWithScore,
  });
});

// Get match by ID
const getMatchById = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      m.match_id, m.status, m.created_at,
      m.requester_id, m.receiver_id,
      u1.first_name as requester_first_name,
      u1.last_name as requester_last_name,
      u2.first_name as receiver_first_name,
      u2.last_name as receiver_last_name,
      r.restaurant_id, r.name as restaurant_name
     FROM matches m
     JOIN restaurants r ON m.restaurant_id = r.restaurant_id
     JOIN users u1 ON m.requester_id = u1.user_id
     JOIN users u2 ON m.receiver_id = u2.user_id
     WHERE m.match_id = $1 AND (m.requester_id = $2 OR m.receiver_id = $2)`,
    [matchId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Match not found', 404);
  }

  const match = result.rows[0];
  res.json({
    match: {
      match_id: match.match_id,
      requester_id: match.requester_id,
      receiver_id: match.receiver_id,
      requester_first_name: match.requester_first_name,
      receiver_first_name: match.receiver_first_name,
      restaurant_id: match.restaurant_id,
      restaurant_name: match.restaurant_name,
      status: match.status,
      created_at: match.created_at,
    },
  });
});

// Request a match
const requestMatch = asyncHandler(async (req, res) => {
  const requesterId = req.user.userId;
  const { receiverId, restaurantId } = req.body;

  if (!receiverId || !restaurantId) {
    throw new AppError('Receiver ID and Restaurant ID are required', 400);
  }

  if (requesterId === receiverId) {
    throw new AppError('Cannot match with yourself', 400);
  }

  // Check if match already exists
  const existingMatch = await query(
    `SELECT match_id FROM matches 
     WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
       AND restaurant_id = $3`,
    [requesterId, receiverId, restaurantId]
  );

  if (existingMatch.rows.length > 0) {
    throw new AppError('Match request already exists', 409);
  }

  // Check if receiver exists
  const receiverCheck = await query(
    'SELECT user_id FROM users WHERE user_id = $1',
    [receiverId]
  );

  if (receiverCheck.rows.length === 0) {
    throw new AppError('Receiver not found', 404);
  }

  // Check if restaurant exists
  const restaurantCheck = await query(
    'SELECT restaurant_id FROM restaurants WHERE restaurant_id = $1',
    [restaurantId]
  );

  if (restaurantCheck.rows.length === 0) {
    throw new AppError('Restaurant not found', 404);
  }

  const result = await query(
    `INSERT INTO matches (requester_id, receiver_id, restaurant_id, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING match_id, status, created_at`,
    [requesterId, receiverId, restaurantId]
  );

  res.status(201).json({
    message: 'Match request created successfully',
    match: {
      match_id: result.rows[0].match_id,
      status: result.rows[0].status,
      created_at: result.rows[0].created_at,
    },
  });
});

// Accept a match request
const acceptMatch = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  // Get match details
  const matchResult = await query(
    `SELECT 
      m.match_id, m.requester_id, m.receiver_id, m.status,
      u1.first_name as requester_first_name,
      u1.last_name as requester_last_name,
      u2.first_name as receiver_first_name,
      u2.last_name as receiver_last_name,
      r.name as restaurant_name
     FROM matches m
     JOIN restaurants r ON m.restaurant_id = r.restaurant_id
     JOIN users u1 ON m.requester_id = u1.user_id
     JOIN users u2 ON m.receiver_id = u2.user_id
     WHERE m.match_id = $1`,
    [matchId]
  );

  if (matchResult.rows.length === 0) {
    throw new AppError('Match not found', 404);
  }

  const match = matchResult.rows[0];

  // Verify user is the receiver
  if (match.receiver_id !== userId) {
    throw new AppError('Only the receiver can accept a match request', 403);
  }

  // Check if already accepted
  if (match.status === 'accepted' || match.status === 'completed') {
    throw new AppError('Match is already accepted', 400);
  }

  // Update match status
  const updateResult = await query(
    `UPDATE matches 
     SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
     WHERE match_id = $1
     RETURNING match_id, status, updated_at`,
    [matchId]
  );

  // Emit real-time event to requester
  const emitToUser = req.app.get('emitToUser');
  if (emitToUser) {
    emitToUser(match.requester_id, 'match_accepted', {
      match_id: matchId,
      accepted_by: `${match.receiver_first_name} ${match.receiver_last_name}`,
      restaurant_name: match.restaurant_name,
    });
  }

  // Send push notification to requester (non-blocking)
  const requesterName = `${match.requester_first_name} ${match.requester_last_name}`;
  notificationService.sendMatchNotification(
    match.requester_id,
    requesterName,
    match.restaurant_name
  ).catch(err => {
    console.error('Failed to send match notification:', err);
  });

  res.json({
    message: 'Match accepted successfully',
    match: {
      match_id: updateResult.rows[0].match_id,
      status: updateResult.rows[0].status,
      updated_at: updateResult.rows[0].updated_at,
    },
  });
});

// Reject a match request
const rejectMatch = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  const matchResult = await query(
    'SELECT match_id, receiver_id, status FROM matches WHERE match_id = $1',
    [matchId]
  );

  if (matchResult.rows.length === 0) {
    throw new AppError('Match not found', 404);
  }

  const match = matchResult.rows[0];

  if (match.receiver_id !== userId) {
    throw new AppError('Only the receiver can reject a match request', 403);
  }

  if (match.status !== 'pending') {
    throw new AppError('Can only reject pending match requests', 400);
  }

  const result = await query(
    `UPDATE matches 
     SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
     WHERE match_id = $1
     RETURNING match_id, status, updated_at`,
    [matchId]
  );

  res.json({
    message: 'Match request rejected',
    match: result.rows[0],
  });
});

// Delete/unmatch an existing match
const deleteMatch = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  const matchResult = await query(
    'SELECT match_id FROM matches WHERE match_id = $1 AND (requester_id = $2 OR receiver_id = $2)',
    [matchId, userId]
  );

  if (matchResult.rows.length === 0) {
    throw new AppError('Match not found', 404);
  }

  await query('DELETE FROM messages WHERE match_id = $1', [matchId]);
  await query('DELETE FROM ratings WHERE match_id = $1', [matchId]);
  await query('DELETE FROM matches WHERE match_id = $1', [matchId]);

  res.json({ message: 'Match deleted successfully' });
});

// Get pending match requests (incoming)
const getPendingMatches = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      m.match_id, m.status, m.created_at,
      m.requester_id, m.receiver_id,
      u.first_name, u.last_name, u.profile_photo_url,
      u.bio, u.occupation,
      r.restaurant_id, r.name as restaurant_name
     FROM matches m
     JOIN users u ON m.requester_id = u.user_id
     JOIN restaurants r ON m.restaurant_id = r.restaurant_id
     WHERE m.receiver_id = $1 AND m.status = 'pending'
     ORDER BY m.created_at DESC`,
    [userId]
  );

  res.json({
    pendingMatches: result.rows.map(row => ({
      match_id: row.match_id,
      requester_id: row.requester_id,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_photo_url: row.profile_photo_url,
      bio: row.bio,
      occupation: row.occupation,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      status: row.status,
      created_at: row.created_at,
    })),
  });
});

// Calculate compatibility score between two users
function calculateCompatibilityScore(user1, user2, sharedRestaurants = []) {
  let score = 50; // Base score
  let reasons = [];

  // Dietary preferences match (up to 15 points)
  const diet1 = Array.isArray(user1.dietary_tags) ? user1.dietary_tags : [];
  const diet2 = Array.isArray(user2.dietary_tags) ? user2.dietary_tags : [];
  const sharedDiet = diet1.filter(tag => diet2.includes(tag));
  if (sharedDiet.length > 0) {
    score += Math.min(sharedDiet.length * 5, 15);
    reasons.push(`Similar dietary preferences (${sharedDiet.join(', ')})`);
  }

  // Conversation style compatibility (up to 10 points)
  const conv1 = user1.conversation_preference || '';
  const conv2 = user2.conversation_preference || '';
  if (conv1 && conv2) {
    if (conv1 === conv2) {
      score += 10;
      reasons.push(`Same conversation style (${conv1})`);
    } else if (conv1 === 'flexible' || conv2 === 'flexible') {
      score += 5;
      reasons.push('Flexible conversation style');
    }
  }

  // Shared restaurant history (up to 20 points)
  if (sharedRestaurants.length > 0) {
    score += Math.min(sharedRestaurants.length * 10, 20);
    reasons.push(`Both dined at ${sharedRestaurants.slice(0, 2).join(', ')}${sharedRestaurants.length > 2 ? ' and more' : ''}`);
  }

  // Occupation diversity bonus (up to 5 points)
  if (user1.occupation && user2.occupation && user1.occupation !== user2.occupation) {
    score += 5;
    reasons.push('Different professional backgrounds');
  }

  // Photo verification bonus (5 points)
  if (user1.is_photo_verified && user2.is_photo_verified) {
    score += 5;
    reasons.push('Both photo verified');
  }

  // Instagram verification bonus (5 points)
  if (user1.instagram_is_verified && user2.instagram_is_verified) {
    score += 5;
    reasons.push('Both Instagram verified');
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    reasons: reasons.slice(0, 3), // Top 3 reasons
  };
}

// Get smart matches with compatibility scoring
const getSmartMatches = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { lat, lng } = req.query;
  const radiusMiles = 20;

  // Get current user's profile
  const userResult = await query(
    `SELECT 
      user_id, first_name, last_name, bio, occupation,
      conversation_preference, dietary_tags, is_photo_verified,
      instagram_is_verified
     FROM users 
     WHERE user_id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const currentUser = userResult.rows[0];

  // Parse dietary tags
  let dietaryTags = currentUser.dietary_tags || [];
  if (typeof dietaryTags === 'string') {
    try { dietaryTags = JSON.parse(dietaryTags); } catch { dietaryTags = []; }
  }
  currentUser.dietary_tags = dietaryTags;

  // Get user's check-in history
  const userCheckInsResult = await query(
    `SELECT DISTINCT ci.restaurant_id, r.name 
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1`,
    [userId]
  );
  const userRestaurantIds = userCheckInsResult.rows.map(r => r.restaurant_id);

  // Get active users nearby with location filter
  let locationFilter = '';
  let locationParams = [userId];

  if (lat && lng) {
    locationFilter = `AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
      AND (3959 * acos(
        cos(radians($2)) * cos(radians(u.latitude)) *
        cos(radians(u.longitude) - radians($3)) +
        sin(radians($2)) * sin(radians(u.latitude))
      )) <= $4`;
    locationParams = [userId, parseFloat(lat), parseFloat(lng), radiusMiles];
  }

  // Get potential matches (users who have checked in recently or are nearby)
  const potentialMatchesResult = await query(
    `SELECT DISTINCT
      u.user_id, u.first_name, u.last_name, u.bio, u.occupation,
      u.conversation_preference, u.dietary_tags, u.profile_photo_url,
      u.is_photo_verified, u.instagram_handle, u.instagram_is_verified,
      u.latitude, u.longitude,
      (SELECT COUNT(*) FROM check_ins WHERE user_id = u.user_id AND check_in_time > NOW() - INTERVAL '30 days') as recent_checkins,
      (SELECT MAX(check_in_time) FROM check_ins WHERE user_id = u.user_id AND is_active = TRUE) as last_active_checkin
     FROM users u
     WHERE u.user_id != $1
       AND u.user_id NOT IN (
         SELECT requester_id FROM matches WHERE receiver_id = $1 AND status IN ('pending', 'accepted', 'rejected')
         UNION
         SELECT receiver_id FROM matches WHERE requester_id = $1 AND status IN ('pending', 'accepted', 'rejected')
       )
       ${locationFilter}
       AND EXISTS (
         SELECT 1 FROM check_ins WHERE user_id = u.user_id AND check_in_time > NOW() - INTERVAL '30 days'
       )
     ORDER BY recent_checkins DESC, last_active_checkin DESC NULLS LAST
     LIMIT 50`,
    locationParams
  );

  // Calculate compatibility scores
  const scoredMatches = await Promise.all(
    potentialMatchesResult.rows.map(async (potentialMatch) => {
      // Parse dietary tags
      let otherDietaryTags = potentialMatch.dietary_tags || [];
      if (typeof otherDietaryTags === 'string') {
        try { otherDietaryTags = JSON.parse(otherDietaryTags); } catch { otherDietaryTags = []; }
      }
      potentialMatch.dietary_tags = otherDietaryTags;

      // Get shared restaurants
      const sharedRestaurantsResult = await query(
        `SELECT DISTINCT r.name
         FROM check_ins ci1
         JOIN check_ins ci2 ON ci1.restaurant_id = ci2.restaurant_id AND ci2.user_id = $1
         JOIN restaurants r ON ci1.restaurant_id = r.restaurant_id
         WHERE ci1.user_id = $2
         LIMIT 5`,
        [userId, potentialMatch.user_id]
      );
      const sharedRestaurants = sharedRestaurantsResult.rows.map(r => r.name);

      const compatibility = calculateCompatibilityScore(currentUser, potentialMatch, sharedRestaurants);

      return {
        user_id: potentialMatch.user_id,
        first_name: potentialMatch.first_name,
        last_name: potentialMatch.last_name,
        bio: potentialMatch.bio,
        occupation: potentialMatch.occupation,
        profile_photo_url: potentialMatch.profile_photo_url,
        is_photo_verified: potentialMatch.is_photo_verified,
        instagram_handle: potentialMatch.instagram_handle,
        instagram_is_verified: potentialMatch.instagram_is_verified,
        compatibility_score: compatibility.score,
        compatibility_reasons: compatibility.reasons,
        recent_checkins: parseInt(potentialMatch.recent_checkins) || 0,
        is_active: !!potentialMatch.last_active_checkin,
      };
    })
  );

  // Sort by compatibility score (descending)
  scoredMatches.sort((a, b) => b.compatibility_score - a.compatibility_score);

  res.json({
    matches: scoredMatches.slice(0, 20),
    count: scoredMatches.length,
    user_preferences: {
      dietary_tags: dietaryTags,
      conversation_preference: currentUser.conversation_preference,
    },
  });
});

module.exports = {
  getMyMatches,
  getMatchById,
  requestMatch,
  acceptMatch,
  rejectMatch,
  deleteMatch,
  getPendingMatches,
  getSmartMatches,
};
