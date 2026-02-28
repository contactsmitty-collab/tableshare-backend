const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const { moderateMessageText } = require('../utils/messageModeration');

// Get messages for a match
const getMessages = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  // Verify user is part of the match
  const matchCheck = await query(
    'SELECT match_id FROM matches WHERE match_id = $1 AND (requester_id = $2 OR receiver_id = $2)',
    [matchId, userId]
  );

  if (matchCheck.rows.length === 0) {
    throw new AppError('Match not found or access denied', 404);
  }

  const result = await query(
    `SELECT 
      m.message_id, m.message_text, m.created_at, m.is_read,
      u.user_id as sender_id, u.first_name, u.last_name, u.profile_photo_url
     FROM messages m
     JOIN users u ON m.sender_id = u.user_id
     WHERE m.match_id = $1
     ORDER BY m.created_at ASC`,
    [matchId]
  );

  // Mark messages as read
  await query(
    'UPDATE messages SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE match_id = $1 AND sender_id != $2 AND is_read = false',
    [matchId, userId]
  );

  res.json({
    messages: result.rows.map(row => ({
      message_id: row.message_id,
      match_id: matchId,
      sender_id: row.sender_id,
      sender_name: `${row.first_name} ${row.last_name}`,
      profile_photo_url: row.profile_photo_url,
      message_text: row.message_text,
      created_at: row.created_at,
      is_read: row.is_read,
    })),
  });
});

// Send a message
const sendMessage = asyncHandler(async (req, res) => {
  const { matchId, messageText } = req.body;
  const senderId = req.user.userId;

  if (!matchId || !messageText) {
    throw new AppError('Match ID and message text are required', 400);
  }

  // Verify user is part of the match
  const matchCheck = await query(
    'SELECT match_id, status FROM matches WHERE match_id = $1 AND (requester_id = $2 OR receiver_id = $2)',
    [matchId, senderId]
  );

  if (matchCheck.rows.length === 0) {
    throw new AppError('Match not found or access denied', 404);
  }

  if (matchCheck.rows[0].status !== 'accepted' && matchCheck.rows[0].status !== 'completed') {
    throw new AppError('Match must be accepted before sending messages', 400);
  }

  const { allowed } = await moderateMessageText(messageText);
  if (!allowed) {
    throw new AppError('Please rephrase your message.', 400);
  }

  // Get or create a conversation for this match
  let convResult = await query(
    'SELECT conversation_id FROM conversations WHERE match_id = $1',
    [matchId]
  );

  if (convResult.rows.length === 0) {
    convResult = await query(
      'INSERT INTO conversations (match_id) VALUES ($1) RETURNING conversation_id',
      [matchId]
    );
  }

  const conversationId = convResult.rows[0].conversation_id;

  const result = await query(
    `INSERT INTO messages (conversation_id, match_id, sender_id, message_text, content)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING message_id, created_at`,
    [conversationId, matchId, senderId, messageText]
  );

  // Get sender info and match info for notification
  const senderResult = await query(
    'SELECT user_id, first_name, last_name, profile_photo_url FROM users WHERE user_id = $1',
    [senderId]
  );

  // Get the other user in the match to send notification
  const matchInfo = await query(
    `SELECT 
      CASE 
        WHEN requester_id = $1 THEN receiver_id
        ELSE requester_id
      END as other_user_id
     FROM matches WHERE match_id = $2`,
    [senderId, matchId]
  );

  const messageData = {
    message_id: result.rows[0].message_id,
    match_id: matchId,
    sender_id: senderId,
    sender_name: `${senderResult.rows[0].first_name} ${senderResult.rows[0].last_name}`,
    profile_photo_url: senderResult.rows[0].profile_photo_url,
    message_text: messageText,
    created_at: result.rows[0].created_at,
    is_read: false,
  };

  // Emit real-time message via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${matchId}`).emit('new_message', messageData);
  }

  // Send push notification to the other user (non-blocking)
  if (matchInfo.rows.length > 0) {
    const otherUserId = matchInfo.rows[0].other_user_id;
    const senderName = messageData.sender_name;
    const messagePreview = messageText.length > 50 
      ? messageText.substring(0, 47) + '...' 
      : messageText;

    // Also emit a notification event for the other user
    const emitToUser = req.app.get('emitToUser');
    if (emitToUser) {
      emitToUser(otherUserId, 'new_message_notification', {
        matchId,
        senderName,
        preview: messagePreview,
      });
    }

    notificationService.sendMessageNotification(
      otherUserId,
      senderName,
      messagePreview
    ).catch(err => {
      console.error('Failed to send message notification:', err);
    });
  }

  res.status(201).json({
    success: true,
    data: messageData,
  });
});

module.exports = {
  getMessages,
  sendMessage,
};
