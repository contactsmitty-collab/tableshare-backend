const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const pointsService = require('../services/pointsService');
const notificationService = require('../services/notificationService');
const { computeCompatibilityScore } = require('../utils/compatibilityScore');

// Get user's check-ins
const getMyCheckIns = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      ci.check_in_id, ci.party_size, ci.notes, ci.photo_url,
      ci.check_in_time, ci.is_active, ci.group_id,
      r.restaurant_id, r.name as restaurant_name, r.address, r.city
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1
     ORDER BY ci.check_in_time DESC`,
    [userId]
  );

  res.json({
    checkIns: result.rows.map(row => ({
      check_in_id: row.check_in_id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      address: row.address,
      city: row.city,
      party_size: row.party_size,
      notes: row.notes,
      check_in_time: row.check_in_time,
      is_active: row.is_active,
      photo_url: row.photo_url,
      group_id: row.group_id,
    })),
  });
});

// Create check-in
const createCheckIn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  // Handle both JSON and FormData
  const restaurantId = req.body.restaurantId || req.body.restaurant_id;
  const partySize = req.body.partySize || req.body.party_size || 1;
  const notes = req.body.notes || null;
  const groupId = req.body.groupId || req.body.group_id || null;
  
  // Upload photo to Cloudinary if provided
  let photoUrl = null;
  if (req.file) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = require('cloudinary').v2.uploader.upload_stream(
          {
            folder: 'tableshare/checkins',
            transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });
      photoUrl = result.secure_url;
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
    }
  } else if (req.body.photoUrl) {
    photoUrl = req.body.photoUrl;
  }

  if (!restaurantId) {
    throw new AppError('Restaurant ID is required', 400);
  }

  // Prevent duplicate active check-ins at the same restaurant (within 3 hours)
  const existingCheckIn = await query(
    `SELECT check_in_id FROM check_ins
     WHERE user_id = $1 AND restaurant_id = $2 AND is_active = true
       AND check_in_time > NOW() - INTERVAL '3 hours'`,
    [userId, restaurantId]
  );

  if (existingCheckIn.rows.length > 0) {
    throw new AppError('You are already checked in at this restaurant', 409);
  }

  // Deactivate any other active check-ins for this user (can only be at one place)
  await query(
    `UPDATE check_ins SET is_active = false WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  const result = await query(
    `INSERT INTO check_ins (user_id, restaurant_id, party_size, notes, photo_url, group_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING check_in_id, check_in_time, is_active`,
    [userId, restaurantId, partySize, notes, photoUrl, groupId]
  );

  // Get restaurant details
  const restaurantResult = await query(
    'SELECT name, address, city FROM restaurants WHERE restaurant_id = $1',
    [restaurantId]
  );

  // Award points for check-in
  const checkInId = result.rows[0].check_in_id;
  await pointsService.awardPoints(userId, 'check_in', null, checkInId, 'Check-in at restaurant');
  
  // Award bonus points for photo
  if (photoUrl) {
    await pointsService.awardPoints(userId, 'check_in_photo', null, checkInId, 'Added photo to check-in');
  }

  // Update streak and award streak bonuses
  const streakInfo = await pointsService.updateCheckInStreak(userId);

  // Award venue loyalty points
  const loyaltyResult = await pointsService.awardVenueLoyaltyPoints(userId, restaurantId, checkInId);

  // Update challenge progress for this check-in
  const challengeResult = await pointsService.updateChallengeProgress(userId, 'checkin', checkInId);

  // Get user info for notifications
  const userResult = await query(
    'SELECT first_name, last_name FROM users WHERE user_id = $1',
    [userId]
  );
  const userName = userResult.rows[0] 
    ? `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`
    : 'Someone';

  // Notify other users at the same restaurant (non-blocking)
  // Find users with active check-ins at the same restaurant in the last 2 hours
  const nearbyUsers = await query(
    `SELECT DISTINCT ci.user_id
     FROM check_ins ci
     WHERE ci.restaurant_id = $1
       AND ci.user_id != $2
       AND ci.is_active = true
       AND ci.check_in_time > NOW() - INTERVAL '2 hours'`,
    [restaurantId, userId]
  );

  // Send notifications to nearby users
  const restaurantName = restaurantResult.rows[0]?.name || 'this restaurant';
  for (const nearbyUser of nearbyUsers.rows) {
    notificationService.sendNearbyCheckInNotification(
      nearbyUser.user_id,
      userName,
      restaurantName
    ).catch(err => {
      console.error(`Failed to send check-in notification to user ${nearbyUser.user_id}:`, err);
    });
  }

  res.status(201).json({
    message: 'Check-in created successfully',
    checkIn: {
      check_in_id: checkInId,
      restaurant_name: restaurantResult.rows[0]?.name,
      address: restaurantResult.rows[0]?.address,
      city: restaurantResult.rows[0]?.city,
      party_size: partySize,
      notes: notes,
      check_in_time: result.rows[0].check_in_time,
      is_active: result.rows[0].is_active,
      photo_url: photoUrl,
      group_id: groupId,
    },
    streak: streakInfo,
    loyalty: loyaltyResult,
  });
});

// Get check-ins at a restaurant (sorted by compatibility score when available)
const getRestaurantCheckIns = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      ci.check_in_id, ci.party_size, ci.notes, ci.photo_url,
      ci.check_in_time, ci.is_active,
      u.user_id, u.first_name, u.last_name, u.profile_photo_url,
      u.bio, u.conversation_preference, u.occupation, u.dietary_tags
     FROM check_ins ci
     JOIN users u ON ci.user_id = u.user_id
     WHERE ci.restaurant_id = $1
       AND ci.is_active = true
       AND ci.user_id != $2
       AND ci.check_in_time > NOW() - INTERVAL '4 hours'
     ORDER BY ci.check_in_time DESC
     LIMIT 50`,
    [restaurantId, userId]
  );

  const myProfileResult = await query(
    'SELECT conversation_preference, dietary_tags FROM users WHERE user_id = $1',
    [userId]
  );
  const myProfile = myProfileResult.rows[0] || { conversation_preference: 'flexible', dietary_tags: null };

  const usersWithScore = result.rows.map((row) => {
    const otherProfile = {
      conversation_preference: row.conversation_preference,
      dietary_tags: row.dietary_tags,
    };
    const compatibility_score = computeCompatibilityScore(myProfile, otherProfile);
    const { dietary_tags, ...rest } = row;
    return { ...rest, compatibility_score };
  });

  usersWithScore.sort((a, b) => (b.compatibility_score || 0) - (a.compatibility_score || 0));

  res.json({
    users: usersWithScore,
  });
});

// Get user's dining groups
const getMyGroups = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT DISTINCT
      dg.group_id, dg.group_name, dg.created_at,
      u.first_name || ' ' || u.last_name as creator_name,
      dg.created_by,
      COUNT(DISTINCT gm.user_id) as member_count
     FROM dining_groups dg
     JOIN users u ON dg.created_by = u.user_id
     LEFT JOIN group_members gm ON dg.group_id = gm.group_id
     WHERE dg.created_by = $1 OR EXISTS (
       SELECT 1 FROM group_members WHERE group_id = dg.group_id AND user_id = $1
     )
     GROUP BY dg.group_id, dg.group_name, dg.created_at, u.first_name, u.last_name, dg.created_by
     ORDER BY dg.created_at DESC`,
    [userId]
  );

  res.json({
    groups: result.rows,
  });
});

// Discover all groups
const discoverGroups = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      dg.group_id, 
      dg.group_name, 
      dg.created_at,
      COALESCE(u.first_name || ' ' || u.last_name, 'Unknown User') as creator_name,
      dg.created_by,
      COUNT(DISTINCT gm.user_id) as member_count
     FROM dining_groups dg
     LEFT JOIN users u ON dg.created_by = u.user_id
     LEFT JOIN group_members gm ON dg.group_id = gm.group_id
     GROUP BY dg.group_id, dg.group_name, dg.created_at, u.first_name, u.last_name, dg.created_by
     ORDER BY dg.created_at DESC
     LIMIT 50`,
    []
  );

  res.json({
    groups: result.rows || [],
  });
});

// Create dining group
const createGroup = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupName, restaurantId } = req.body;

  if (!groupName) {
    throw new AppError('Group name is required', 400);
  }

  const result = await query(
    `INSERT INTO dining_groups (group_name, created_by, restaurant_id)
     VALUES ($1, $2, $3)
     RETURNING group_id, group_name, created_at`,
    [groupName, userId, restaurantId || null]
  );

  const groupId = result.rows[0].group_id;

  // Add creator as member
  await query(
    'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
    [groupId, userId]
  );

  // Award points for creating group
  await pointsService.awardPoints(userId, 'group_create', null, groupId, 'Created dining group');

  res.status(201).json({
    message: 'Group created successfully',
    group: {
      group_id: groupId,
      group_name: result.rows[0].group_name,
      created_at: result.rows[0].created_at,
    },
  });
});

// Get group members
const getGroupMembers = asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  const result = await query(
    `SELECT 
      u.user_id, u.first_name, u.last_name, u.profile_photo_url, u.occupation
     FROM group_members gm
     JOIN users u ON gm.user_id = u.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId]
  );

  res.json({
    members: result.rows.map(row => ({
      user_id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_photo_url: row.profile_photo_url,
      occupation: row.occupation,
    })),
  });
});

// Join group
const joinGroup = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;

  // Check if group exists
  const groupResult = await query(
    'SELECT group_id FROM dining_groups WHERE group_id = $1',
    [groupId]
  );

  if (groupResult.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  // Check if already a member
  const existingMember = await query(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );

  if (existingMember.rows.length > 0) {
    throw new AppError('Already a member of this group', 409);
  }

  await query(
    'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
    [groupId, userId]
  );

  // Award points for joining group
  await pointsService.awardPoints(userId, 'group_join', null, groupId, 'Joined dining group');

  res.json({
    message: 'Successfully joined group',
  });
});

// Leave group
const leaveGroup = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;

  const result = await query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );

  if (result.rowCount === 0) {
    throw new AppError('Not a member of this group', 404);
  }

  res.json({
    message: 'Successfully left group',
  });
});

// Check if user has an active check-in at a specific restaurant
const getActiveCheckIn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { restaurantId } = req.params;

  const result = await query(
    `SELECT check_in_id, check_in_time FROM check_ins
     WHERE user_id = $1 AND restaurant_id = $2 AND is_active = true
       AND check_in_time > NOW() - INTERVAL '12 hours'`,
    [userId, restaurantId]
  );

  res.json({
    checkedIn: result.rows.length > 0,
    checkIn: result.rows[0] || null,
  });
});

// Delete a check-in
const deleteCheckIn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { checkInId } = req.params;

  const result = await query(
    `DELETE FROM check_ins WHERE check_in_id = $1 AND user_id = $2 RETURNING check_in_id`,
    [checkInId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Check-in not found or not yours', 404);
  }

  res.json({ message: 'Check-in deleted' });
});

module.exports = {
  getMyCheckIns,
  createCheckIn,
  getRestaurantCheckIns,
  getActiveCheckIn,
  deleteCheckIn,
  getMyGroups,
  discoverGroups,
  createGroup,
  getGroupMembers,
  joinGroup,
  leaveGroup,
};
