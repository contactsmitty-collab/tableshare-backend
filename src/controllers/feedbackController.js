const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_TYPE_LENGTH = 50;

const submitFeedback = asyncHandler(async (req, res) => {
  const userId = req.user?.userId || null;
  const { message, type = 'general' } = req.body;

  if (!message || typeof message !== 'string') {
    throw new AppError('Message is required', 400);
  }
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) {
    throw new AppError('Message cannot be empty', 400);
  }
  const typeSafe = String(type).trim().slice(0, MAX_TYPE_LENGTH) || 'general';

  await query(
    `INSERT INTO user_feedback (user_id, message, type) VALUES ($1, $2, $3)`,
    [userId, trimmed, typeSafe]
  );

  res.status(201).json({ success: true, message: 'Thank you for your feedback.' });
});

module.exports = { submitFeedback };
