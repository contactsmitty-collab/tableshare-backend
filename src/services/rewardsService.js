const { query } = require('../config/database');
const pointsService = require('./pointsService');

const TIERS = [
  { id: 'first_course', name: 'First Course', threshold: 0, points_per_shared_table: 50 },
  { id: 'main_course', name: 'Main Course', threshold: 4, points_per_shared_table: 75 },
  { id: 'chefs_table', name: "Chef's Table", threshold: 10, points_per_shared_table: 100 },
];

const BASE_APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://tableshare.pixelcheese.com';

function getTierBySharedTables(count) {
  let tier = TIERS[0];
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (count >= TIERS[i].threshold) {
      tier = TIERS[i];
      break;
    }
  }
  return tier;
}

function getNextTier(currentTier) {
  const idx = TIERS.findIndex((t) => t.id === currentTier.id);
  if (idx < 0 || idx >= TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

/**
 * Ensure user has a referral code; create if missing.
 */
async function ensureReferralCode(userId) {
  const r = await query(
    'SELECT referral_code FROM users WHERE user_id = $1',
    [userId]
  );
  if (r.rows.length === 0) return null;
  let code = r.rows[0].referral_code;
  if (code) return code;
  code = 'TS-' + require('crypto').randomBytes(4).toString('hex').toUpperCase() + '-' + require('crypto').randomBytes(2).toString('hex').toUpperCase();
  await query(
    'UPDATE users SET referral_code = $1 WHERE user_id = $2',
    [code, userId]
  );
  return code;
}

/**
 * GET /rewards/overview — points, tier, referral for current user.
 */
async function getOverview(userId) {
  const [pointsRow, userRow] = await Promise.all([
    query(
      `SELECT total_points, lifetime_points, COALESCE(shared_tables_count, 0) AS shared_tables_count, COALESCE(tier, 'first_course') AS tier
       FROM user_points WHERE user_id = $1`,
      [userId]
    ),
    query(
      'SELECT referral_code, referred_by_user_id FROM users WHERE user_id = $1',
      [userId]
    ),
  ]);

  // Ensure user_points row exists
  if (pointsRow.rows.length === 0) {
    await query('INSERT INTO user_points (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const retry = await query(
      `SELECT total_points, lifetime_points, COALESCE(shared_tables_count, 0) AS shared_tables_count, COALESCE(tier, 'first_course') AS tier
       FROM user_points WHERE user_id = $1`,
      [userId]
    );
    pointsRow.rows = retry.rows;
  }

  const pts = pointsRow.rows[0] || {
    total_points: 0,
    lifetime_points: 0,
    shared_tables_count: 0,
    tier: 'first_course',
  };
  const shared = Number(pts.shared_tables_count) || 0;
  const tierId = (pts.tier || 'first_course').toLowerCase();
  const currentTier = TIERS.find((t) => t.id === tierId) || getTierBySharedTables(shared);
  const nextTier = getNextTier(currentTier);
  const dinnersToNext = nextTier ? Math.max(0, nextTier.threshold - shared) : 0;

  let referralCode = userRow.rows[0]?.referral_code;
  if (!referralCode) {
    referralCode = await ensureReferralCode(userId);
  }
  const inviteUrl = referralCode ? `${BASE_APP_URL}/join?ref=${referralCode}` : null;

  let referralsCount = 0;
  if (userId) {
    const countResult = await query(
      'SELECT COUNT(*) AS c FROM users WHERE referred_by_user_id = $1',
      [userId]
    );
    referralsCount = parseInt(countResult.rows[0]?.c || 0, 10);
  }

  return {
    points: {
      total_points: Number(pts.total_points) || 0,
      lifetime_points: Number(pts.lifetime_points) || 0,
    },
    tier: {
      id: currentTier.id,
      name: currentTier.name,
      shared_tables_count: shared,
      next_tier_id: nextTier?.id || null,
      next_tier_threshold: nextTier?.threshold ?? currentTier.threshold,
      dinners_to_next: dinnersToNext,
      points_per_shared_table: currentTier.points_per_shared_table,
    },
    referral: referralCode
      ? {
          referral_code: referralCode,
          invite_url: inviteUrl,
          referrals_count: referralsCount,
        }
      : null,
  };
}

/**
 * GET /rewards/catalog — list redeemable rewards, optional ?category=
 */
async function getCatalog(category) {
  let sql = 'SELECT reward_id, name, subtitle, points_cost, category, emoji, active FROM rewards_catalog WHERE active = TRUE';
  const params = [];
  if (category && category !== 'all') {
    sql += ' AND category = $1';
    params.push(category);
  }
  sql += ' ORDER BY category, points_cost';
  const result = await query(sql, params.length ? params : undefined);
  return result.rows.map((r) => ({
    reward_id: r.reward_id,
    name: r.name,
    subtitle: r.subtitle,
    points_cost: r.points_cost,
    category: r.category,
    emoji: r.emoji,
    active: r.active,
  }));
}

/**
 * POST /rewards/redeem — spend points on a reward.
 */
async function redeem(userId, rewardId) {
  const catalogRow = await query(
    'SELECT reward_id, name, points_cost FROM rewards_catalog WHERE reward_id = $1 AND active = TRUE',
    [rewardId]
  );
  if (catalogRow.rows.length === 0) {
    const err = new Error('Reward not found or inactive');
    err.statusCode = 404;
    throw err;
  }
  const reward = catalogRow.rows[0];
  const cost = reward.points_cost;

  const balanceRow = await query(
    'SELECT total_points FROM user_points WHERE user_id = $1',
    [userId]
  );
  const balance = balanceRow.rows.length > 0 ? Number(balanceRow.rows[0].total_points) : 0;
  if (balance < cost) {
    const err = new Error('Insufficient points');
    err.statusCode = 402;
    throw err;
  }

  // Deduct points
  await query(
    `UPDATE user_points SET total_points = total_points - $1, updated_at = NOW() WHERE user_id = $2`,
    [cost, userId]
  );
  // Record transaction (negative)
  await query(
    `INSERT INTO point_transactions (user_id, points, transaction_type, reference_id, description)
     VALUES ($1, $2, 'redemption', NULL, $3)`,
    [userId, -cost, `Redeemed: ${reward.name}`]
  );
  // Record redemption
  const redResult = await query(
    `INSERT INTO reward_redemptions (user_id, reward_id, points_spent, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING redemption_id, points_spent, status`,
    [userId, rewardId, cost]
  );
  const row = redResult.rows[0];
  return {
    redemption_id: row.redemption_id,
    points_spent: row.points_spent,
    status: row.status,
    message: 'Reward redeemed successfully.',
  };
}

module.exports = {
  getOverview,
  getCatalog,
  redeem,
  ensureReferralCode,
  getTierBySharedTables,
  getNextTier,
  TIERS,
};
