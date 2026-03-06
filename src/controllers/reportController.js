const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const VALID_TARGET_TYPES = ['user', 'restaurant'];
const MAX_REASON_LENGTH = 100;
const MAX_DETAILS_LENGTH = 2000;

const createReport = asyncHandler(async (req, res) => {
  const reporterId = req.user.userId;
  const { target_type, target_id, reason, details } = req.body;

  if (!target_type || !VALID_TARGET_TYPES.includes(target_type)) {
    throw new AppError('target_type must be "user" or "restaurant"', 400);
  }
  if (!target_id) {
    throw new AppError('target_id is required', 400);
  }

  const reasonSafe = reason != null ? String(reason).trim().slice(0, MAX_REASON_LENGTH) : null;
  const detailsSafe = details != null ? String(details).trim().slice(0, MAX_DETAILS_LENGTH) : null;

  await query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [reporterId, target_type, target_id, reasonSafe, detailsSafe]
  );

  res.status(201).json({ success: true, message: 'Report submitted. We will review it.' });
});

module.exports = { createReport };
