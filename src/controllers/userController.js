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
      created_at: user.created_at,
      updated_at: user.updated_at,
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
  } = req.body;
  const userId = req.user.userId;

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramIndex = 1;

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
    const valid = !Number.isNaN(num) && num >= 1.5 && num <= 5;
    updates.push(`matching_radius_miles = $${paramIndex++}`);
    values.push(valid ? num : 1.5);
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
               neighborhood, matching_radius_miles, market`,
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

module.exports = {
  getMyProfile,
  updateMyProfile,
  getUserById,
  generateAIBio,
};
