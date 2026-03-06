const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { generateBio } = require('../config/openai');

// Get current user profile
const getMyProfile = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      user_id, email, first_name, last_name, date_of_birth,
      bio, occupation, conversation_preference, dietary_tags,
      profile_photo_url, instagram_handle, instagram_is_verified,
      is_photo_verified, verification_status, verified_at,
      role, is_admin, restaurant_id,
      neighborhood, matching_radius_miles, market,
      hide_from_discover,
      open_to_share_table, ideal_dinner_cuisine, ideal_dinner_vibe, ideal_dinner_group_size,
      premium_until, subscription_source,
      created_at, updated_at
     FROM users 
     WHERE user_id = $1`,
    [req.user.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];
  const matchingRadius = user.matching_radius_miles != null ? parseFloat(user.matching_radius_miles) : null;
  res.json({
    user: {
      userId: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      date_of_birth: user.date_of_birth,
      bio: user.bio,
      occupation: user.occupation,
      conversation_preference: user.conversation_preference,
      dietary_tags: user.dietary_tags,
      profile_photo_url: user.profile_photo_url,
      instagram_handle: user.instagram_handle,
      instagram_is_verified: user.instagram_is_verified,
      is_photo_verified: user.is_photo_verified || false,
      verification_status: user.verification_status || 'unverified',
      verified_at: user.verified_at,
      role: user.role || 'user',
      is_admin: user.is_admin || false,
      restaurant_id: user.restaurant_id || null,
      neighborhood: user.neighborhood || null,
      matching_radius_miles: matchingRadius,
      market: user.market || null,
      hide_from_discover: user.hide_from_discover ?? false,
      open_to_share_table: user.open_to_share_table ?? false,
      ideal_dinner_cuisine: user.ideal_dinner_cuisine ?? null,
      ideal_dinner_vibe: user.ideal_dinner_vibe ?? null,
      ideal_dinner_group_size: user.ideal_dinner_group_size ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
      subscription: (() => {
        const until = user.premium_until ? new Date(user.premium_until) : null;
        const isPremium = until && until > new Date();
        return {
          plan: isPremium ? 'premium' : 'free',
          expires_at: user.premium_until ? user.premium_until.toISOString?.() ?? String(user.premium_until) : null,
          source: user.subscription_source || null,
        };
      })(),
      is_premium: (() => {
        const until = user.premium_until ? new Date(user.premium_until) : null;
        return !!(until && until > new Date());
      })(),
      premium_until: user.premium_until ? (user.premium_until.toISOString?.() ?? String(user.premium_until)) : null,
    },
  });
});

// Update current user profile
const updateMyProfile = asyncHandler(async (req, res) => {
  const {
    bio,
    occupation,
    conversationPreference,
    dietaryTags,
    instagramHandle,
    neighborhood,
    matchingRadiusMiles,
    market,
    hide_from_discover,
    open_to_share_table,
    ideal_dinner_cuisine,
    ideal_dinner_vibe,
    ideal_dinner_group_size,
  } = req.body;
  const userId = req.user.userId;

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (hide_from_discover !== undefined) {
    updates.push(`hide_from_discover = $${paramIndex++}`);
    values.push(Boolean(hide_from_discover));
  }
  if (open_to_share_table !== undefined) {
    updates.push(`open_to_share_table = $${paramIndex++}`);
    values.push(Boolean(open_to_share_table));
  }
  if (ideal_dinner_cuisine !== undefined) {
    updates.push(`ideal_dinner_cuisine = $${paramIndex++}`);
    values.push(ideal_dinner_cuisine == null || ideal_dinner_cuisine === '' ? null : String(ideal_dinner_cuisine).slice(0, 100));
  }
  if (ideal_dinner_vibe !== undefined) {
    updates.push(`ideal_dinner_vibe = $${paramIndex++}`);
    values.push(ideal_dinner_vibe == null || ideal_dinner_vibe === '' ? null : String(ideal_dinner_vibe).slice(0, 100));
  }
  if (ideal_dinner_group_size !== undefined) {
    updates.push(`ideal_dinner_group_size = $${paramIndex++}`);
    values.push(ideal_dinner_group_size == null || ideal_dinner_group_size === '' ? null : String(ideal_dinner_group_size).slice(0, 50));
  }
  if (bio !== undefined) {
    updates.push(`bio = $${paramIndex++}`);
    values.push(bio);
  }
  if (occupation !== undefined) {
    updates.push(`occupation = $${paramIndex++}`);
    values.push(occupation);
  }
  if (conversationPreference !== undefined) {
    updates.push(`conversation_preference = $${paramIndex++}`);
    values.push(conversationPreference);
  }
  if (dietaryTags !== undefined) {
    updates.push(`dietary_tags = $${paramIndex++}`);
    values.push(Array.isArray(dietaryTags) ? JSON.stringify(dietaryTags) : dietaryTags);
  }
  if (instagramHandle !== undefined) {
    updates.push(`instagram_handle = $${paramIndex++}`);
    values.push(instagramHandle);
  }
  if (neighborhood !== undefined) {
    updates.push(`neighborhood = $${paramIndex++}`);
    values.push(neighborhood === null || neighborhood === '' ? null : neighborhood);
  }
  if (matchingRadiusMiles !== undefined) {
    const num = Number(matchingRadiusMiles);
    if (Number.isNaN(num) || num < 1.5 || num > 5) {
      throw new AppError('matching_radius_miles must be a number between 1.5 and 5', 400);
    }
    updates.push(`matching_radius_miles = $${paramIndex++}`);
    values.push(num);
  }
  if (market !== undefined) {
    updates.push(`market = $${paramIndex++}`);
    values.push(market === null || market === '' ? null : market);
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(userId);

  const result = await query(
    `UPDATE users 
     SET ${updates.join(', ')}
     WHERE user_id = $${paramIndex}
     RETURNING user_id, email, first_name, last_name, bio, occupation, 
               conversation_preference, dietary_tags, profile_photo_url, 
               instagram_handle, instagram_is_verified,
               neighborhood, matching_radius_miles, market, hide_from_discover,
               open_to_share_table, ideal_dinner_cuisine, ideal_dinner_vibe, ideal_dinner_group_size`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];
  const matchingRadius = user.matching_radius_miles != null ? parseFloat(user.matching_radius_miles) : null;
  res.json({
    message: 'Profile updated successfully',
    user: {
      userId: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      bio: user.bio,
      occupation: user.occupation,
      conversation_preference: user.conversation_preference,
      dietary_tags: typeof user.dietary_tags === 'string'
        ? JSON.parse(user.dietary_tags)
        : user.dietary_tags,
      profile_photo_url: user.profile_photo_url,
      instagram_handle: user.instagram_handle,
      instagram_is_verified: user.instagram_is_verified,
      neighborhood: user.neighborhood || null,
      matching_radius_miles: matchingRadius,
      market: user.market || null,
      hide_from_discover: user.hide_from_discover ?? false,
      open_to_share_table: user.open_to_share_table ?? false,
      ideal_dinner_cuisine: user.ideal_dinner_cuisine ?? null,
      ideal_dinner_vibe: user.ideal_dinner_vibe ?? null,
      ideal_dinner_group_size: user.ideal_dinner_group_size ?? null,
    },
  });
});

// Get user profile by ID
const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await query(
    `SELECT 
      user_id, first_name, last_name,
      bio, occupation, conversation_preference, dietary_tags,
      profile_photo_url, instagram_handle, instagram_is_verified,
      is_photo_verified, created_at
     FROM users 
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  const statsResult = await query(
    `SELECT
       COUNT(*) as total_checkins,
       COUNT(DISTINCT ci.restaurant_id) as total_restaurants,
       COUNT(DISTINCT r.city) as cities_visited
     FROM check_ins ci
     LEFT JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1`,
    [userId]
  );

  const checkInsResult = await query(
    `SELECT ci.check_in_id, ci.check_in_time, ci.photo_url,
            r.name as restaurant_name, r.cuisine_type, r.city
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1
     ORDER BY ci.check_in_time DESC
     LIMIT 10`,
    [userId]
  );

  const stats = statsResult.rows[0] || {};

  res.json({
    user: {
      userId: user.user_id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      first_name: user.first_name,
      last_name: user.last_name,
      bio: user.bio,
      occupation: user.occupation,
      conversation_preference: user.conversation_preference,
      dietary_tags: user.dietary_tags,
      profile_photo_url: user.profile_photo_url,
      instagram_handle: user.instagram_handle,
      instagram_is_verified: user.instagram_is_verified,
      is_photo_verified: user.is_photo_verified || false,
      created_at: user.created_at,
    },
    stats: {
      total_checkins: parseInt(stats.total_checkins) || 0,
      total_restaurants: parseInt(stats.total_restaurants) || 0,
      cities_visited: parseInt(stats.cities_visited) || 0,
    },
    checkIns: checkInsResult.rows,
  });
});

// Generate AI-powered bio
const generateAIBio = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  // Get user's current profile data
  const result = await query(
    `SELECT 
      first_name, last_name, occupation, bio, dietary_tags,
      conversation_preference, interests
     FROM users 
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  // Parse dietary tags and interests if they're stored as JSON
  let dietaryTags = user.dietary_tags || [];
  let interests = user.interests || [];

  if (typeof dietaryTags === 'string') {
    try {
      dietaryTags = JSON.parse(dietaryTags);
    } catch {
      dietaryTags = [];
    }
  }

  if (typeof interests === 'string') {
    try {
      interests = JSON.parse(interests);
    } catch {
      interests = [];
    }
  }

  const userData = {
    interests,
    occupation: user.occupation || '',
    favoriteCuisines: dietaryTags,
    diningStyle: user.conversation_preference || '',
    aboutMe: user.bio || '',
    firstName: user.first_name,
    lastName: user.last_name,
    age: user.age != null ? user.age : undefined,
    city: user.city || undefined,
    gender: user.gender || undefined,
  };

  try {
    const generatedBio = await generateBio(userData);

    res.json({
      bio: generatedBio,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Bio generation error:', error);
    const msg = error?.message || '';
    const code = error?.code;
    if (code === 'OPENAI_NOT_CONFIGURED' || msg.includes('OPENAI_API_KEY') || msg.includes('not configured')) {
      throw new AppError('Bio generation is not configured. Add OPENAI_API_KEY to the server environment.', 503);
    }
    if (error?.status === 401 || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
      throw new AppError('Invalid API key for bio generation. Please contact support.', 503);
    }
    if (error?.status === 429 || msg.includes('rate limit')) {
      throw new AppError('Too many requests. Please try again in a moment.', 429);
    }
    throw new AppError('Failed to generate bio. Please try again.', 500);
  }
});

// Get current user notification preferences
const getNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT user_id, matches, messages, reservations, promotions, created_at, updated_at
     FROM user_notification_preferences WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  const prefs = {
    matches: row ? (row.matches !== false) : true,
    messages: row ? (row.messages !== false) : true,
    reservations: row ? (row.reservations !== false) : true,
    promotions: row ? (row.promotions !== false) : true,
  };
  res.json({ notification_preferences: prefs });
});

// Update current user notification preferences
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { matches, messages, reservations, promotions } = req.body;
  const current = await query(
    `SELECT matches, messages, reservations, promotions FROM user_notification_preferences WHERE user_id = $1`,
    [userId]
  );
  const row = current.rows[0];
  const m = matches !== undefined ? Boolean(matches) : (row ? row.matches !== false : true);
  const msg = messages !== undefined ? Boolean(messages) : (row ? row.messages !== false : true);
  const r = reservations !== undefined ? Boolean(reservations) : (row ? row.reservations !== false : true);
  const p = promotions !== undefined ? Boolean(promotions) : (row ? row.promotions !== false : true);
  await query(
    `INSERT INTO user_notification_preferences (user_id, matches, messages, reservations, promotions)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET matches = $2, messages = $3, reservations = $4, promotions = $5, updated_at = CURRENT_TIMESTAMP`,
    [userId, m, msg, r, p]
  );
  res.json({
    notification_preferences: { matches: m, messages: msg, reservations: r, promotions: p },
  });
});

// Recently viewed restaurants (Phase 3.2)
const recordRecentRestaurant = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { restaurant_id } = req.body;
  if (!restaurant_id) throw new AppError('restaurant_id required', 400);
  await query(
    `INSERT INTO user_recent_restaurants (user_id, restaurant_id) VALUES ($1, $2)
     ON CONFLICT (user_id, restaurant_id) DO UPDATE SET viewed_at = NOW()`,
    [userId, restaurant_id]
  );
  res.status(204).send();
});

const getRecentRestaurants = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `SELECT urr.restaurant_id, urr.viewed_at, r.name, r.cuisine_type, r.photo_url, r.city
     FROM user_recent_restaurants urr
     JOIN restaurants r ON r.restaurant_id = urr.restaurant_id
     WHERE urr.user_id = $1
     ORDER BY urr.viewed_at DESC
     LIMIT 15`,
    [userId]
  );
  res.json({ restaurants: result.rows });
});

// Onboarding status (Phase 4.2) - derived from existing data
const getOnboardingStatus = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const [profile, checkIns, matches] = await Promise.all([
    query(
      'SELECT is_photo_verified, dietary_tags FROM users WHERE user_id = $1',
      [userId]
    ),
    query('SELECT 1 FROM check_ins WHERE user_id = $1 LIMIT 1', [userId]),
    query(
      `SELECT 1 FROM matches WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted' LIMIT 1`,
      [userId]
    ),
  ]);
  const p = profile.rows[0] || {};
  let dietaryTags = p.dietary_tags;
  if (typeof dietaryTags === 'string') {
    try { dietaryTags = JSON.parse(dietaryTags); } catch { dietaryTags = []; }
  }
  const dietary_set = Array.isArray(dietaryTags) ? dietaryTags.length > 0 : !!dietaryTags;
  res.json({
    photo_verified: !!p.is_photo_verified,
    dietary_set,
    first_checkin: (checkIns.rows.length > 0),
    first_match: (matches.rows.length > 0),
  });
});

// Dining stats / year in review (Phase 4.3)
const getDiningStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const [totals, byCuisine, topRestaurants] = await Promise.all([
    query(
      `SELECT COUNT(*) as total_checkins, COUNT(DISTINCT ci.restaurant_id) as unique_restaurants, COUNT(DISTINCT r.city) as cities_visited
       FROM check_ins ci
       LEFT JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
       WHERE ci.user_id = $1`,
      [userId]
    ),
    query(
      `SELECT r.cuisine_type, COUNT(*) as count
       FROM check_ins ci
       JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
       WHERE ci.user_id = $1 AND r.cuisine_type IS NOT NULL AND r.cuisine_type != ''
       GROUP BY r.cuisine_type
       ORDER BY count DESC
       LIMIT 10`,
      [userId]
    ),
    query(
      `SELECT r.restaurant_id, r.name, r.cuisine_type, r.city, COUNT(*) as visit_count
       FROM check_ins ci
       JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
       WHERE ci.user_id = $1
       GROUP BY r.restaurant_id, r.name, r.cuisine_type, r.city
       ORDER BY visit_count DESC
       LIMIT 10`,
      [userId]
    ),
  ]);
  const t = totals.rows[0] || {};
  res.json({
    total_checkins: parseInt(t.total_checkins) || 0,
    unique_restaurants: parseInt(t.unique_restaurants) || 0,
    cities_visited: parseInt(t.cities_visited) || 0,
    top_cuisines: byCuisine.rows,
    top_restaurants: topRestaurants.rows,
  });
});

// Activity feed preference (Phase 4.4)
const getActivityPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    'SELECT show_my_activity FROM user_activity_preferences WHERE user_id = $1',
    [userId]
  );
  const row = result.rows[0];
  res.json({
    show_my_activity: row ? row.show_my_activity !== false : true,
  });
});

const updateActivityPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { show_my_activity } = req.body;
  await query(
    `INSERT INTO user_activity_preferences (user_id, show_my_activity) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET show_my_activity = $2, updated_at = NOW()`,
    [userId, show_my_activity !== false]
  );
  res.json({ show_my_activity: show_my_activity !== false });
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  getUserById,
  generateAIBio,
  getNotificationPreferences,
  updateNotificationPreferences,
  getActivityPreferences,
  updateActivityPreferences,
  recordRecentRestaurant,
  getRecentRestaurants,
  getOnboardingStatus,
  getDiningStats,
};
