const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const pointsService = require('../services/pointsService');
const notificationService = require('../services/notificationService');

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// Search users by name (for invite)
const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const userId = req.user.userId;

  if (!q || q.length < 2) {
    return res.json({ users: [] });
  }

  const result = await query(
    `SELECT user_id, first_name, last_name, profile_photo_url, is_photo_verified, occupation
     FROM users
     WHERE user_id != $1
       AND (LOWER(first_name) LIKE LOWER($2) OR LOWER(last_name) LIKE LOWER($2)
            OR LOWER(first_name || ' ' || last_name) LIKE LOWER($2))
     ORDER BY first_name ASC
     LIMIT 20`,
    [userId, `%${q}%`]
  );

  res.json({ users: result.rows });
});

// Create group with invite code
const createGroup = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupName, description, restaurantId } = req.body;

  if (!groupName) throw new AppError('Group name is required', 400);

  let inviteCode;
  let attempts = 0;
  while (attempts < 5) {
    inviteCode = generateInviteCode();
    const existing = await query('SELECT 1 FROM dining_groups WHERE invite_code = $1', [inviteCode]);
    if (existing.rows.length === 0) break;
    attempts++;
  }

  const result = await query(
    `INSERT INTO dining_groups (group_name, description, created_by, restaurant_id, invite_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING group_id, group_name, invite_code, created_at`,
    [groupName, description || null, userId, restaurantId || null, inviteCode]
  );

  const groupId = result.rows[0].group_id;

  await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);
  await pointsService.awardPoints(userId, 'group_create', null, groupId, 'Created dining group');

  res.status(201).json({
    message: 'Group created',
    group: result.rows[0],
  });
});

// Join group by invite code
const joinByCode = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { code } = req.body;

  if (!code) throw new AppError('Invite code is required', 400);

  const groupResult = await query(
    'SELECT group_id, group_name FROM dining_groups WHERE invite_code = UPPER($1)',
    [code.trim()]
  );

  if (groupResult.rows.length === 0) throw new AppError('Invalid invite code', 404);

  const groupId = groupResult.rows[0].group_id;

  const existing = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (existing.rows.length > 0) throw new AppError('Already a member', 409);

  await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);
  await pointsService.awardPoints(userId, 'group_join', null, groupId, 'Joined dining group');

  res.json({
    message: `Joined "${groupResult.rows[0].group_name}"`,
    group: groupResult.rows[0],
  });
});

// Invite a user to a group
const inviteUser = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;
  const { inviteeUserId } = req.body;

  if (!inviteeUserId) throw new AppError('inviteeUserId is required', 400);

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not a member of this group', 403);

  const alreadyMember = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, inviteeUserId]
  );
  if (alreadyMember.rows.length > 0) throw new AppError('User is already a member', 409);

  const existingInvite = await query(
    `SELECT 1 FROM group_invites WHERE group_id = $1 AND invitee_user_id = $2 AND status = 'pending'`,
    [groupId, inviteeUserId]
  );
  if (existingInvite.rows.length > 0) throw new AppError('Invite already sent', 409);

  await query(
    `INSERT INTO group_invites (group_id, inviter_user_id, invitee_user_id, invite_type, status)
     VALUES ($1, $2, $3, 'user', 'pending')`,
    [groupId, userId, inviteeUserId]
  );

  const groupResult = await query('SELECT group_name FROM dining_groups WHERE group_id = $1', [groupId]);
  const inviterResult = await query('SELECT first_name FROM users WHERE user_id = $1', [userId]);

  notificationService.sendToUser(
    inviteeUserId,
    'Group Invite',
    `${inviterResult.rows[0]?.first_name || 'Someone'} invited you to join "${groupResult.rows[0]?.group_name}"`,
    { type: 'group_invite', groupId }
  ).catch(() => {});

  res.json({ message: 'Invite sent' });
});

// Respond to a group invite (handles both user invites and group-to-group invites)
const respondToInvite = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { inviteId } = req.params;
  const { accept } = req.body;

  // Try user invite first, then group-to-group invite (where user is creator of target group)
  let inviteResult = await query(
    `SELECT * FROM group_invites WHERE invite_id = $1 AND invitee_user_id = $2 AND status = 'pending'`,
    [inviteId, userId]
  );

  if (inviteResult.rows.length === 0) {
    inviteResult = await query(
      `SELECT gi.* FROM group_invites gi
       JOIN dining_groups dg ON gi.target_group_id = dg.group_id
       WHERE gi.invite_id = $1 AND dg.created_by = $2 AND gi.status = 'pending'`,
      [inviteId, userId]
    );
  }

  if (inviteResult.rows.length === 0) throw new AppError('Invite not found', 404);

  const invite = inviteResult.rows[0];

  if (accept) {
    await query(
      `UPDATE group_invites SET status = 'accepted', responded_at = NOW() WHERE invite_id = $1`,
      [inviteId]
    );

    if (invite.invite_type === 'group' && invite.target_group_id) {
      // Group-to-group: merge source group members into target group
      const sourceMembers = await query(
        'SELECT user_id FROM group_members WHERE group_id = $1',
        [invite.group_id]
      );
      for (const member of sourceMembers.rows) {
        await query(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [invite.target_group_id, member.user_id]
        );
      }
      res.json({ message: 'Groups merged! All members can now see each other.' });
    } else {
      await query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [invite.group_id, userId]
      );
      await pointsService.awardPoints(userId, 'group_join', null, invite.group_id, 'Accepted group invite');
      res.json({ message: 'Invite accepted' });
    }
  } else {
    await query(
      `UPDATE group_invites SET status = 'declined', responded_at = NOW() WHERE invite_id = $1`,
      [inviteId]
    );
    res.json({ message: 'Invite declined' });
  }
});

// Get pending invites for current user
const getMyInvites = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT gi.invite_id, gi.group_id, gi.invite_type, gi.created_at,
            dg.group_name, dg.description,
            u.first_name as inviter_name, u.profile_photo_url as inviter_photo
     FROM group_invites gi
     JOIN dining_groups dg ON gi.group_id = dg.group_id
     JOIN users u ON gi.inviter_user_id = u.user_id
     WHERE gi.invitee_user_id = $1 AND gi.status = 'pending'
     ORDER BY gi.created_at DESC`,
    [userId]
  );

  res.json({ invites: result.rows });
});

// Check in group at a restaurant
const groupCheckIn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;
  const { restaurantId } = req.body;

  if (!restaurantId) throw new AppError('restaurantId is required', 400);

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not a member of this group', 403);

  await query(
    `UPDATE dining_groups SET checked_in_restaurant_id = $1, checked_in_at = NOW(), is_active = TRUE WHERE group_id = $2`,
    [restaurantId, groupId]
  );

  const members = await query('SELECT user_id FROM group_members WHERE group_id = $1', [groupId]);
  for (const member of members.rows) {
    if (member.user_id === userId) continue;

    const existing = await query(
      `SELECT 1 FROM check_ins WHERE user_id = $1 AND restaurant_id = $2 AND is_active = TRUE AND check_in_time > NOW() - INTERVAL '4 hours'`,
      [member.user_id, restaurantId]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO check_ins (user_id, restaurant_id, party_size, notes, group_id) VALUES ($1, $2, 1, 'Group check-in', $3)`,
        [member.user_id, restaurantId, groupId]
      );
    }
  }

  const restaurantResult = await query('SELECT name FROM restaurants WHERE restaurant_id = $1', [restaurantId]);

  res.json({
    message: `Group checked in at ${restaurantResult.rows[0]?.name || 'restaurant'}`,
  });
});

// Check out group (leave restaurant so group no longer appears in "Groups here")
const groupCheckOut = asyncHandler(async (req, res) => {
  const userId = req.user?.userId || req.user?.user_id;
  if (!userId) throw new AppError('Authentication required', 401);

  const { groupId } = req.params;
  if (!groupId) throw new AppError('Group ID is required', 400);

  const groupRow = await query(
    'SELECT group_id, checked_in_restaurant_id, group_name, created_by FROM dining_groups WHERE group_id = $1',
    [groupId]
  );
  if (groupRow.rows.length === 0) throw new AppError('Group not found', 404);
  const group = groupRow.rows[0];
  if (!group.checked_in_restaurant_id) {
    return res.json({ message: 'Group is not checked in anywhere' });
  }

  const isCreator = group.created_by && String(group.created_by) === String(userId);
  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  const isMember = memberCheck.rows.length > 0;
  if (!isMember && !isCreator) throw new AppError('You are not a member of this group', 403);

  await query(
    'UPDATE dining_groups SET is_active = FALSE, checked_in_restaurant_id = NULL WHERE group_id = $1',
    [groupId]
  );

  res.json({
    message: `${group.group_name} has checked out. You no longer appear in "Groups here" at this restaurant.`,
  });
});

// Discover groups at the same restaurant (includes user's own groups with is_member flag)
const discoverGroupsAtRestaurant = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `SELECT
       dg.group_id, dg.group_name, dg.description, dg.checked_in_at, dg.invite_code,
       u.first_name || ' ' || u.last_name as creator_name,
       u.profile_photo_url as creator_photo,
       u.is_photo_verified as creator_verified,
       COUNT(DISTINCT gm.user_id) as member_count,
       ARRAY_AGG(DISTINCT mu.first_name) FILTER (WHERE mu.user_id IS NOT NULL) as member_names,
       ARRAY_AGG(DISTINCT mu.profile_photo_url) FILTER (WHERE mu.profile_photo_url IS NOT NULL) as member_photos,
       EXISTS (SELECT 1 FROM group_members WHERE group_id = dg.group_id AND user_id = $2) as is_member
     FROM dining_groups dg
     JOIN users u ON dg.created_by = u.user_id
     LEFT JOIN group_members gm ON dg.group_id = gm.group_id
     LEFT JOIN users mu ON gm.user_id = mu.user_id
     WHERE dg.checked_in_restaurant_id = $1
       AND dg.is_active = TRUE
       AND dg.checked_in_at > NOW() - INTERVAL '4 hours'
     GROUP BY dg.group_id, dg.group_name, dg.description, dg.checked_in_at, dg.invite_code,
              u.first_name, u.last_name, u.profile_photo_url, u.is_photo_verified
     ORDER BY dg.checked_in_at DESC`,
    [restaurantId, userId]
  );

  res.json({ groups: result.rows });
});

// Invite another group to merge/join tables
const inviteGroup = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;
  const { targetGroupId } = req.body;

  if (!targetGroupId) throw new AppError('targetGroupId is required', 400);

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not a member of this group', 403);

  const existing = await query(
    `SELECT 1 FROM group_invites WHERE group_id = $1 AND target_group_id = $2 AND status = 'pending'`,
    [groupId, targetGroupId]
  );
  if (existing.rows.length > 0) throw new AppError('Invite already sent to this group', 409);

  await query(
    `INSERT INTO group_invites (group_id, inviter_user_id, target_group_id, invite_type, status)
     VALUES ($1, $2, $3, 'group', 'pending')`,
    [groupId, userId, targetGroupId]
  );

  const targetCreator = await query(
    'SELECT created_by FROM dining_groups WHERE group_id = $1',
    [targetGroupId]
  );

  const myGroup = await query('SELECT group_name FROM dining_groups WHERE group_id = $1', [groupId]);
  const inviterResult = await query('SELECT first_name FROM users WHERE user_id = $1', [userId]);

  if (targetCreator.rows.length > 0) {
    notificationService.sendToUser(
      targetCreator.rows[0].created_by,
      'Table Merge Request',
      `${inviterResult.rows[0]?.first_name}'s group "${myGroup.rows[0]?.group_name}" wants to join tables with you!`,
      { type: 'group_merge_invite', groupId, targetGroupId }
    ).catch(() => {});
  }

  res.json({ message: 'Group invite sent!' });
});

// Get group invites for groups I created (group-to-group)
const getGroupInvites = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT gi.invite_id, gi.group_id, gi.target_group_id, gi.invite_type, gi.created_at,
            source_group.group_name as source_group_name,
            target_group.group_name as target_group_name,
            u.first_name as inviter_name, u.profile_photo_url as inviter_photo,
            COUNT(DISTINCT gm.user_id) as source_member_count
     FROM group_invites gi
     JOIN dining_groups source_group ON gi.group_id = source_group.group_id
     JOIN dining_groups target_group ON gi.target_group_id = target_group.group_id
     JOIN users u ON gi.inviter_user_id = u.user_id
     LEFT JOIN group_members gm ON gi.group_id = gm.group_id
     WHERE target_group.created_by = $1
       AND gi.status = 'pending'
       AND gi.invite_type = 'group'
     GROUP BY gi.invite_id, gi.group_id, gi.target_group_id, gi.invite_type, gi.created_at,
              source_group.group_name, target_group.group_name, u.first_name, u.profile_photo_url
     ORDER BY gi.created_at DESC`,
    [userId]
  );

  res.json({ invites: result.rows });
});

// Get full group details with members
const getGroupDetails = asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  const groupResult = await query(
    `SELECT dg.*, u.first_name || ' ' || u.last_name as creator_name,
            r.name as restaurant_name, r.address as restaurant_address
     FROM dining_groups dg
     JOIN users u ON dg.created_by = u.user_id
     LEFT JOIN restaurants r ON dg.checked_in_restaurant_id = r.restaurant_id
     WHERE dg.group_id = $1`,
    [groupId]
  );

  if (groupResult.rows.length === 0) throw new AppError('Group not found', 404);

  const membersResult = await query(
    `SELECT u.user_id, u.first_name, u.last_name, u.profile_photo_url,
            u.occupation, u.is_photo_verified
     FROM group_members gm
     JOIN users u ON gm.user_id = u.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId]
  );

  res.json({
    group: groupResult.rows[0],
    members: membersResult.rows,
  });
});

// ─── Scheduled group dinner (group events) ───

const createGroupEvent = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { groupId } = req.params;
  const { restaurant_id: restaurantId, proposed_date: proposedDate, proposed_time: proposedTime, title, notes } = req.body;

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not a member of this group', 403);
  if (!restaurantId || !proposedDate) throw new AppError('restaurant_id and proposed_date are required', 400);

  const insert = await query(
    `INSERT INTO group_events (group_id, restaurant_id, proposed_date, proposed_time, created_by, title, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING event_id, group_id, restaurant_id, proposed_date, proposed_time, created_by, status, title, notes, created_at`,
    [groupId, restaurantId, proposedDate, proposedTime || null, userId, title || null, notes || null]
  );
  const event = insert.rows[0];

  const members = await query('SELECT user_id FROM group_members WHERE group_id = $1', [groupId]);
  for (const m of members.rows) {
    await query(
      'INSERT INTO group_event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
      [event.event_id, m.user_id, m.user_id === userId ? 'going' : 'pending']
    );
    if (m.user_id !== userId) {
      const groupRow = await query('SELECT group_name FROM dining_groups WHERE group_id = $1', [groupId]);
      const restRow = await query('SELECT name FROM restaurants WHERE restaurant_id = $1', [restaurantId]);
      const creatorRow = await query('SELECT first_name FROM users WHERE user_id = $1', [userId]);
      notificationService.sendToUser(
        m.user_id,
        'Group dinner scheduled',
        `${creatorRow.rows[0]?.first_name || 'Someone'} scheduled a group dinner at ${restRow.rows[0]?.name || 'a restaurant'} for ${proposedDate}. Open the app to RSVP.`,
        { type: 'group_event', eventId: event.event_id, groupId }
      ).catch(() => {});
    }
  }

  const restResult = await query('SELECT name FROM restaurants WHERE restaurant_id = $1', [restaurantId]);
  res.status(201).json({
    message: 'Group dinner scheduled',
    event: {
      ...event,
      restaurant_name: restResult.rows[0]?.name,
    },
  });
});

const getMyGroupEvents = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { upcoming } = req.query;

  let whereClause = `EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = ge.group_id AND gm.user_id = $1)`;
  const params = [userId];
  if (upcoming === 'true') {
    whereClause += ` AND ge.proposed_date >= CURRENT_DATE AND ge.status = 'scheduled'`;
  }

  const result = await query(
    `SELECT ge.event_id, ge.group_id, ge.restaurant_id, ge.proposed_date, ge.proposed_time, ge.created_by, ge.status, ge.title, ge.notes, ge.created_at,
            dg.group_name, r.name as restaurant_name,
            (SELECT status FROM group_event_rsvps WHERE event_id = ge.event_id AND user_id = $1) as my_rsvp
     FROM group_events ge
     JOIN dining_groups dg ON ge.group_id = dg.group_id
     JOIN restaurants r ON ge.restaurant_id = r.restaurant_id
     WHERE ${whereClause}
     ORDER BY ge.proposed_date ASC, ge.proposed_time ASC NULLS LAST`,
    params
  );
  res.json({ events: result.rows });
});

const getGroupEventDetail = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { eventId } = req.params;

  const eventResult = await query(
    `SELECT ge.*, dg.group_name, r.name as restaurant_name, r.address as restaurant_address,
            u.first_name || ' ' || u.last_name as creator_name
     FROM group_events ge
     JOIN dining_groups dg ON ge.group_id = dg.group_id
     JOIN restaurants r ON ge.restaurant_id = r.restaurant_id
     JOIN users u ON ge.created_by = u.user_id
     WHERE ge.event_id = $1`,
    [eventId]
  );
  if (eventResult.rows.length === 0) throw new AppError('Event not found', 404);

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [eventResult.rows[0].group_id, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not in this group', 403);

  const rsvps = await query(
    `SELECT ger.user_id, ger.status, ger.responded_at, u.first_name, u.last_name, u.profile_photo_url
     FROM group_event_rsvps ger
     JOIN users u ON ger.user_id = u.user_id
     WHERE ger.event_id = $1
     ORDER BY ger.responded_at ASC`,
    [eventId]
  );

  res.json({
    event: eventResult.rows[0],
    rsvps: rsvps.rows,
  });
});

const rsvpToGroupEvent = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { eventId } = req.params;
  const { status } = req.body;

  if (!status || !['going', 'not_going', 'pending'].includes(status)) {
    throw new AppError('status must be going, not_going, or pending', 400);
  }

  const eventRow = await query(
    'SELECT group_id FROM group_events WHERE event_id = $1',
    [eventId]
  );
  if (eventRow.rows.length === 0) throw new AppError('Event not found', 404);

  const memberCheck = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [eventRow.rows[0].group_id, userId]
  );
  if (memberCheck.rows.length === 0) throw new AppError('You are not in this group', 403);

  await query(
    `INSERT INTO group_event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3, responded_at = NOW()`,
    [eventId, userId, status]
  );
  res.json({ message: 'RSVP updated', status });
});

module.exports = {
  searchUsers,
  createGroup,
  joinByCode,
  inviteUser,
  respondToInvite,
  getMyInvites,
  groupCheckIn,
  groupCheckOut,
  discoverGroupsAtRestaurant,
  inviteGroup,
  getGroupInvites,
  getGroupDetails,
  createGroupEvent,
  getMyGroupEvents,
  getGroupEventDetail,
  rsvpToGroupEvent,
};
