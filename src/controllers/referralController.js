const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const crypto = require('crypto');

function generateCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// POST /referrals/invite - generate or get my referral code/link
const createInvite = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  let result = await query(
    'SELECT id, code, created_at FROM referrals WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  let code;
  if (result.rows.length > 0) {
    code = result.rows[0].code;
  } else {
    code = generateCode();
    await query(
      'INSERT INTO referrals (referrer_id, code) VALUES ($1, $2)',
      [userId, code]
    );
  }
  res.json({
    code,
    link: `tableshare://referral/${code}`,
    message: 'Share your code or link with friends. When they sign up and complete their first check-in, you both get rewarded.',
  });
});

// GET /referrals/my - list my referrals (as referrer)
const getMyReferrals = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT r.id, r.code, r.status, r.created_at, r.completed_at,
            u.first_name as referred_first_name, u.last_name as referred_last_name
     FROM referrals r
     LEFT JOIN users u ON u.user_id = r.referred_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  res.json({ referrals: result.rows });
});

module.exports = { createInvite, getMyReferrals };
