const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Send invitation (after match)
const sendInvitation = asyncHandler(async (req, res) => {
  const initiatorId = req.user.userId;
  const { companionId, restaurantId, proposedDate, proposedTime, notes } = req.body;
  if (!companionId || !restaurantId || !proposedDate) {
    throw new AppError('companionId, restaurantId, and proposedDate are required', 400);
  }
  if (companionId === initiatorId) {
    throw new AppError('Cannot invite yourself', 400);
  }
  const insert = await query(
    `INSERT INTO dinner_invitations (initiator_id, companion_id, restaurant_id, proposed_date, proposed_time, initiator_notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING invitation_id, companion_id, restaurant_id, proposed_date, proposed_time, initiator_notes, status, created_at`,
    [initiatorId, companionId, restaurantId, proposedDate, proposedTime || null, notes || null]
  );
  const row = insert.rows[0];
  const [restaurant, initiator] = await Promise.all([
    query('SELECT name, cuisine_type, city, price_range FROM restaurants WHERE restaurant_id = $1', [restaurantId]),
    query('SELECT first_name, last_name, avatar_url FROM users WHERE user_id = $1', [initiatorId]),
  ]);
  res.status(201).json({
    invitation: {
      ...row,
      restaurant_name: restaurant.rows[0]?.name,
      cuisine_type: restaurant.rows[0]?.cuisine_type,
      city: restaurant.rows[0]?.city,
      price_range: restaurant.rows[0]?.price_range,
      initiator_name: [initiator.rows[0]?.first_name, initiator.rows[0]?.last_name].filter(Boolean).join(' '),
      initiator_avatar_url: initiator.rows[0]?.avatar_url,
    },
  });
});

// List received invitations (pending)
const getReceivedInvitations = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT i.invitation_id, i.restaurant_id, i.proposed_date, i.proposed_time, i.initiator_notes, i.status, i.created_at,
            r.name as restaurant_name, r.cuisine_type, r.city, r.price_range,
            u.user_id as initiator_id, u.first_name as initiator_first_name, u.last_name as initiator_last_name, u.avatar_url as initiator_avatar_url
     FROM dinner_invitations i
     JOIN restaurants r ON r.restaurant_id = i.restaurant_id
     JOIN users u ON u.user_id = i.initiator_id
     WHERE i.companion_id = $1 AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    [userId]
  );
  res.json({ invitations: result.rows });
});

// List sent invitations
const getSentInvitations = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT i.invitation_id, i.companion_id, i.restaurant_id, i.proposed_date, i.proposed_time, i.initiator_notes, i.status, i.created_at,
            r.name as restaurant_name, r.cuisine_type, r.city,
            u.first_name as companion_first_name, u.last_name as companion_last_name, u.avatar_url as companion_avatar_url
     FROM dinner_invitations i
     JOIN restaurants r ON r.restaurant_id = i.restaurant_id
     JOIN users u ON u.user_id = i.companion_id
     WHERE i.initiator_id = $1
     ORDER BY i.created_at DESC`,
    [userId]
  );
  res.json({ invitations: result.rows });
});

// Accept invitation
const acceptInvitation = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { invitationId } = req.params;
  const { dietaryNotes } = req.body;
  const result = await query(
    `UPDATE dinner_invitations
     SET status = 'accepted', companion_dietary_notes = COALESCE($2, companion_dietary_notes), updated_at = CURRENT_TIMESTAMP
     WHERE invitation_id = $1 AND companion_id = $3 AND status = 'pending'
     RETURNING invitation_id, initiator_id, restaurant_id, proposed_date, proposed_time, initiator_notes, companion_dietary_notes`,
    [invitationId, dietaryNotes || null, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Invitation not found or already responded', 404);
  }
  res.json({ success: true, invitation: result.rows[0] });
});

// Suggest changes (different date/time)
const suggestChanges = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { invitationId } = req.params;
  const { suggestedDate, suggestedTime, notes } = req.body;
  const result = await query(
    `UPDATE dinner_invitations
     SET status = 'suggested_changes', suggested_date = $2, suggested_time = $3, suggested_notes = $4, updated_at = CURRENT_TIMESTAMP
     WHERE invitation_id = $1 AND companion_id = $5 AND status = 'pending'
     RETURNING invitation_id`,
    [invitationId, suggestedDate || null, suggestedTime || null, notes || null, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Invitation not found or already responded', 404);
  }
  res.json({ success: true });
});

// Decline invitation
const declineInvitation = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { invitationId } = req.params;
  const result = await query(
    `UPDATE dinner_invitations SET status = 'declined', updated_at = CURRENT_TIMESTAMP
     WHERE invitation_id = $1 AND companion_id = $2 AND status = 'pending'
     RETURNING invitation_id`,
    [invitationId, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Invitation not found or already responded', 404);
  }
  res.json({ success: true });
});

// Get confirmed dinners (for "Confirmed" view / Add to Calendar)
const getConfirmedDinners = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT i.invitation_id, i.restaurant_id, i.proposed_date, i.proposed_time, i.initiator_notes, i.companion_dietary_notes,
            r.name as restaurant_name, r.cuisine_type, r.address, r.city, r.latitude, r.longitude,
            initiator.user_id as initiator_id, initiator.first_name as initiator_first_name, initiator.last_name as initiator_last_name, initiator.avatar_url as initiator_avatar_url,
            companion.user_id as companion_id, companion.first_name as companion_first_name, companion.last_name as companion_last_name, companion.avatar_url as companion_avatar_url
     FROM dinner_invitations i
     JOIN restaurants r ON r.restaurant_id = i.restaurant_id
     JOIN users initiator ON initiator.user_id = i.initiator_id
     JOIN users companion ON companion.user_id = i.companion_id
     WHERE (i.initiator_id = $1 OR i.companion_id = $1) AND i.status = 'accepted'
     ORDER BY i.proposed_date ASC, i.proposed_time ASC NULLS LAST`,
    [userId]
  );
  res.json({ dinners: result.rows });
});

module.exports = {
  sendInvitation,
  getReceivedInvitations,
  getSentInvitations,
  acceptInvitation,
  suggestChanges,
  declineInvitation,
  getConfirmedDinners,
};
