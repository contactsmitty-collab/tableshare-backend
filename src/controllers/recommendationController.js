/**
 * Recommendation Controller
 * AI-Powered Restaurant Recommendations
 */

const { query } = require('../config/database');
let generateRecommendations;
try {
  generateRecommendations = require('../config/openai').generateRecommendations;
} catch (_) {
  generateRecommendations = null;
}

// Get personalized "For You" recommendations
const getForYouRecommendations = async (req, res) => {
  const userId = req.user.userId;
  const { limit = 20, offset = 0, latitude, longitude } = req.query;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 50);

  const emptyResponse = () => res.json({
    status: 'success',
    data: [],
    meta: { total: 0, has_more: false, refreshed_at: new Date().toISOString() },
  });

  const sendFallback = async () => {
    try {
      let fallback = await getForYouFallback(userId, limitNum);
      if (latitude && longitude && fallback.length > 0) {
        fallback = await applyDistanceScoring(fallback, latitude, longitude);
      }
      try {
        const enriched = await enrichWithReasoning(fallback, userId);
        return res.json({
          status: 'success',
          data: enriched,
          meta: { total: enriched.length, has_more: enriched.length >= limitNum, refreshed_at: new Date().toISOString() },
        });
      } catch (e) {
        const withReason = fallback.map((r) => ({ ...r, reason: r.reason_description || 'Recommended for you', match_percentage: 80 }));
        return res.json({
          status: 'success',
          data: withReason,
          meta: { total: withReason.length, has_more: withReason.length >= limitNum, refreshed_at: new Date().toISOString() },
        });
      }
    } catch (fallbackErr) {
      console.error('For You: getForYouFallback failed', fallbackErr?.message || fallbackErr);
      return emptyResponse();
    }
  };

  try {
    await ensureUserTasteProfile(userId);
  } catch (err) {
    console.error('For You: ensureUserTasteProfile failed', err?.message || err);
    return sendFallback();
  }

  let recommendations;
  try {
    recommendations = await getCachedRecommendations(userId, 'for_you', limitNum, parseInt(offset, 10) || 0);
    if (recommendations.length === 0) {
      await generateFreshRecommendations(userId, limitNum);
      recommendations = await getCachedRecommendations(userId, 'for_you', limitNum, parseInt(offset, 10) || 0);
    }
  } catch (err) {
    console.error('For You: getCachedRecommendations/generateFresh failed', err?.message || err);
    return sendFallback();
  }

  if (recommendations.length === 0) {
    return sendFallback();
  }

  try {
    if (latitude && longitude && recommendations.length > 0) {
      recommendations = await applyDistanceScoring(recommendations, latitude, longitude);
    }
    let enrichedRecommendations = await enrichWithReasoning(recommendations, userId);

    if (generateRecommendations && enrichedRecommendations.length > 0) {
      try {
        const userProfile = await getUserProfileForAI(userId);
        const restaurantList = enrichedRecommendations.map(r => ({
          name: r.restaurant_name,
          cuisine_type: r.cuisine_type,
          price_range: r.price_range,
          vibe: r.vibe,
          highlights: r.highlights || [],
        }));
        const aiOrderedNames = await generateRecommendations(userProfile, restaurantList, Math.min(limitNum, enrichedRecommendations.length));
        if (aiOrderedNames.length > 0) {
          const byName = new Map(enrichedRecommendations.map(r => [r.restaurant_name, r]));
          const reordered = aiOrderedNames.map(name => byName.get(name)).filter(Boolean);
          const remaining = enrichedRecommendations.filter(r => !aiOrderedNames.includes(r.restaurant_name));
          enrichedRecommendations = [...reordered, ...remaining];
        }
      } catch (aiErr) {
        console.error('For You: AI re-rank failed', aiErr?.message || aiErr);
      }
    }

    res.json({
      status: 'success',
      data: enrichedRecommendations,
      meta: {
        total: enrichedRecommendations.length,
        has_more: enrichedRecommendations.length >= limitNum,
        refreshed_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('For You: enrichWithReasoning or response failed', err?.message || err);
    return sendFallback();
  }
};

// Get "Because You Liked X" recommendations
const getSimilarTo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    const { limit = 10 } = req.query;
    
    // Get similar restaurants based on content similarity and collaborative filtering
    const similarRestaurants = await query(
      `SELECT 
        r.*,
        rs.similarity_score,
        rs.similarity_factors,
        'similar_restaurant' as reason_type,
        'Similar to ' || (SELECT name FROM restaurants WHERE restaurant_id = $2) as reason_description
       FROM restaurant_similarity rs
       JOIN restaurants r ON 
         (rs.restaurant_a_id = $2 AND rs.restaurant_b_id = r.restaurant_id)
         OR (rs.restaurant_b_id = $2 AND rs.restaurant_a_id = r.restaurant_id)
       WHERE rs.similarity_score > 0.5
       AND r.is_active = true
       ORDER BY rs.similarity_score DESC
       LIMIT $1`,
      [limit, restaurantId]
    );
    
    res.json({
      status: 'success',
      data: similarRestaurants.rows
    });
  } catch (error) {
    console.error('Error getting similar restaurants:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get similar restaurants'
    });
  }
};

// Get trending restaurants (from trending_restaurants table; fallback to top-rated when empty/stale)
const getTrending = async (req, res) => {
  const { city, cuisine, limit = 20 } = req.query;
  const userId = req.user.userId;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 50);

  const buildFallbackSql = (params) => {
    let sql = `
      SELECT 
        r.restaurant_id,
        r.name,
        r.photo_url,
        r.cuisine_type,
        r.price_range,
        r.rating,
        r.address,
        r.city,
        r.latitude,
        r.longitude,
        'trending' as reason_type,
        '🌟 Popular picks' as reason_description
      FROM restaurants r
      WHERE 1=1
    `;
    if (city) {
      sql += ` AND r.city = $${params.length + 1}`;
      params.push(city);
    }
    if (cuisine) {
      sql += ` AND r.cuisine_type = $${params.length + 1}`;
      params.push(cuisine);
    }
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id = $${params.length + 1} AND ci.restaurant_id = r.restaurant_id
      AND ci.check_in_time > NOW() - INTERVAL '30 days'
    )`;
    params.push(userId);
    sql += ` ORDER BY COALESCE(r.rating, 0) DESC, COALESCE(r.review_count, 0) DESC LIMIT $${params.length + 1}`;
    params.push(limitNum);
    return sql;
  };

  try {
    let sql = `
      SELECT 
        tr.restaurant_id,
        r.name,
        r.photo_url,
        r.cuisine_type,
        r.price_range,
        r.rating,
        r.address,
        r.city,
        r.latitude,
        r.longitude,
        'trending' as reason_type,
        CASE 
          WHEN tr.trend_direction = 'hot' THEN '🔥 Hot right now!'
          WHEN tr.trend_direction = 'rising' THEN '📈 Rising in popularity'
          ELSE '🌟 Popular this week'
        END as reason_description
      FROM trending_restaurants tr
      JOIN restaurants r ON tr.restaurant_id = r.restaurant_id
      WHERE tr.computed_at > NOW() - INTERVAL '1 hour'
    `;
    const params = [];
    if (city) {
      sql += ` AND r.city = $${params.length + 1}`;
      params.push(city);
    }
    if (cuisine) {
      sql += ` AND r.cuisine_type = $${params.length + 1}`;
      params.push(cuisine);
    }
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM check_ins ci 
      WHERE ci.user_id = $${params.length + 1} 
      AND ci.restaurant_id = tr.restaurant_id
      AND ci.check_in_time > NOW() - INTERVAL '30 days'
    )`;
    params.push(userId);
    sql += ` ORDER BY tr.trending_score DESC LIMIT $${params.length + 1}`;
    params.push(limitNum);

    const result = await query(sql, params);
    if (result.rows.length > 0) {
      return res.json({ status: 'success', data: result.rows });
    }

    const fallbackParams = [];
    const fallbackSql = buildFallbackSql(fallbackParams);
    const fallback = await query(fallbackSql, fallbackParams);
    res.json({ status: 'success', data: fallback.rows });
  } catch (error) {
    console.error('Error getting trending:', error);
    try {
      const fallbackParams = [];
      const fallbackSql = buildFallbackSql(fallbackParams);
      const fallback = await query(fallbackSql, fallbackParams);
      return res.json({ status: 'success', data: fallback.rows });
    } catch (fallbackErr) {
      console.error('Trending fallback failed:', fallbackErr);
      res.status(500).json({ status: 'error', message: 'Failed to get trending restaurants' });
    }
  }
};

// Get discovery/exploration recommendations (outside comfort zone)
const getExplore = async (req, res) => {
  const userId = req.user.userId;
  const limitNum = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  let profile = null;
  try {
    const profileResult = await query(
      `SELECT * FROM user_taste_profiles WHERE user_id = $1`,
      [userId]
    );
    profile = profileResult.rows[0];
  } catch (profileErr) {
    // Table may not exist or DB error; proceed with no profile (show all cuisines)
    console.warn('Explore: could not load taste profile', profileErr?.message || profileErr);
  }

  try {
    let sql = `
      SELECT 
        r.restaurant_id,
        r.name,
        r.photo_url,
        r.cuisine_type,
        r.price_range,
        r.rating,
        r.address,
        r.city,
        r.latitude,
        r.longitude,
        r.highlights,
        'new_cuisine' as reason_type,
        'Try something new: ' || COALESCE(r.cuisine_type, 'variety') as reason_description,
        0.7 as match_confidence
      FROM restaurants r
      WHERE NOT EXISTS (
        SELECT 1 FROM check_ins ci 
        WHERE ci.user_id = $1 
        AND ci.restaurant_id = r.restaurant_id
      )
    `;
    const params = [userId];

    if (profile && profile.cuisine_preferences && typeof profile.cuisine_preferences === 'object') {
      const preferredCuisines = Object.keys(profile.cuisine_preferences)
        .filter(c => profile.cuisine_preferences[c] > 0.3);
      if (preferredCuisines.length > 0) {
        sql += ` AND r.cuisine_type IS NOT NULL AND r.cuisine_type NOT IN (${preferredCuisines.map((_, i) => `$${params.length + 1 + i}`).join(',')})`;
        params.push(...preferredCuisines);
      }
    }

    sql += ` ORDER BY COALESCE(r.rating, 0) DESC, COALESCE(r.review_count, 0) DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limitNum);

    const result = await query(sql, params);
    res.json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Error getting explore recommendations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get exploration recommendations'
    });
  }
};

// Get "Friends Like" recommendations (social-based)
const getFriendsLike = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 10 } = req.query;
    
    // Find restaurants that user's matches/friends have liked
    const result = await query(
      `SELECT 
        r.*,
        COUNT(DISTINCT m.matched_user_id) as friend_count,
        json_agg(DISTINCT jsonb_build_object(
          'user_id', m.matched_user_id,
          'user_name', u.first_name || ' ' || u.last_name,
          'avatar_url', u.avatar_url
        )) FILTER (WHERE m.matched_user_id IS NOT NULL) as liked_by_friends,
        'friends_like' as reason_type,
        COUNT(DISTINCT m.matched_user_id) || ' of your connections like this' as reason_description
       FROM restaurants r
       JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
       JOIN matches m ON ci.user_id = m.matched_user_id
       JOIN users u ON m.matched_user_id = u.user_id
       WHERE m.user_id = $1
       AND m.status = 'accepted'
       AND ci.check_in_time > NOW() - INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM check_ins ci2 
         WHERE ci2.user_id = $1 
         AND ci2.restaurant_id = r.restaurant_id
       )
       GROUP BY r.restaurant_id
       ORDER BY COUNT(DISTINCT m.matched_user_id) DESC, AVG(ci.rating) DESC NULLS LAST
       LIMIT $2`,
      [userId, limit]
    );
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting friends likes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get friend recommendations'
    });
  }
};

// Record user feedback on recommendations
const recordRecommendationFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { restaurantId } = req.params;
    const { action, recommendationType = 'for_you' } = req.body; // 'clicked', 'dismissed', 'visited'
    
    // Update the recommendation cache with feedback
    if (action === 'dismissed') {
      await query(
        `UPDATE recommendation_cache 
         SET dismissed = true, dismissed_at = NOW()
         WHERE user_id = $1 AND restaurant_id = $2 AND recommendation_type = $3`,
        [userId, restaurantId, recommendationType]
      );
    } else if (action === 'clicked') {
      await query(
        `UPDATE recommendation_cache 
         SET clicked_count = clicked_count + 1
         WHERE user_id = $1 AND restaurant_id = $2 AND recommendation_type = $3`,
        [userId, restaurantId, recommendationType]
      );
    }
    
    // Record interaction
    await query(
      `INSERT INTO user_restaurant_interactions (
        user_id, restaurant_id, viewed, viewed_at, interest_score
      ) VALUES ($1, $2, true, NOW(), 
        CASE $3 
          WHEN 'clicked' THEN 0.3
          WHEN 'visited' THEN 1.0
          ELSE 0.1
        END
      )
      ON CONFLICT (user_id, restaurant_id)
      DO UPDATE SET
        viewed = true,
        viewed_at = NOW(),
        interest_score = GREATEST(user_restaurant_interactions.interest_score, 
          CASE $3 
            WHEN 'clicked' THEN 0.3
            WHEN 'visited' THEN 1.0
            ELSE 0.1
          END
        )`,
      [userId, restaurantId, action]
    );
    
    res.json({
      status: 'success',
      message: 'Feedback recorded'
    });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record feedback'
    });
  }
};

// Get user's taste profile
const getMyTasteProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Ensure profile exists
    await ensureUserTasteProfile(userId);
    
    const result = await query(
      `SELECT 
        cuisine_preferences,
        cuisine_exploration_score,
        preferred_price_range,
        price_flexibility,
        ambiance_preferences,
        preferred_dining_style,
        preferred_days,
        preferred_times,
        dietary_restrictions,
        preferred_party_size,
        social_preference,
        preferred_distance_minutes,
        profile_confidence,
        profile_completeness,
        last_updated_at
       FROM user_taste_profiles
       WHERE user_id = $1`,
      [userId]
    );
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting taste profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get taste profile'
    });
  }
};

// Update taste profile manually (user preferences)
const updateTasteProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      preferred_price_range,
      price_flexibility,
      preferred_dining_style,
      dietary_restrictions,
      preferred_party_size,
      social_preference,
      preferred_distance_minutes,
      ambiance_preferences
    } = req.body;
    
    const result = await query(
      `INSERT INTO user_taste_profiles (
        user_id, preferred_price_range, price_flexibility,
        preferred_dining_style, dietary_restrictions,
        preferred_party_size, social_preference,
        preferred_distance_minutes, ambiance_preferences,
        last_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        preferred_price_range = COALESCE($2, user_taste_profiles.preferred_price_range),
        price_flexibility = COALESCE($3, user_taste_profiles.price_flexibility),
        preferred_dining_style = COALESCE($4, user_taste_profiles.preferred_dining_style),
        dietary_restrictions = COALESCE($5, user_taste_profiles.dietary_restrictions),
        preferred_party_size = COALESCE($6, user_taste_profiles.preferred_party_size),
        social_preference = COALESCE($7, user_taste_profiles.social_preference),
        preferred_distance_minutes = COALESCE($8, user_taste_profiles.preferred_distance_minutes),
        ambiance_preferences = COALESCE($9, user_taste_profiles.ambiance_preferences),
        last_updated_at = NOW()
      RETURNING *`,
      [
        userId, preferred_price_range, price_flexibility,
        preferred_dining_style, dietary_restrictions,
        preferred_party_size, social_preference,
        preferred_distance_minutes, ambiance_preferences
      ]
    );
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating taste profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update taste profile'
    });
  }
};

// Get recommendation insights (why am I seeing this?)
const getRecommendationInsights = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user's profile stats
    const profileResult = await query(
      `SELECT 
        profile_completeness,
        profile_confidence,
        cuisine_exploration_score
       FROM user_taste_profiles
       WHERE user_id = $1`,
      [userId]
    );
    
    // Get interaction stats
    const interactionResult = await query(
      `SELECT 
        COUNT(DISTINCT restaurant_id) as restaurants_discovered,
        COUNT(DISTINCT CASE WHEN checked_in THEN restaurant_id END) as restaurants_visited,
        COUNT(DISTINCT CASE WHEN favorited THEN restaurant_id END) as restaurants_favorited,
        AVG(interest_score) as avg_interest_score
       FROM user_restaurant_interactions
       WHERE user_id = $1`,
      [userId]
    );
    
    // Get top cuisines
    const cuisineResult = await query(
      `SELECT 
        r.cuisine_type,
        COUNT(*) as visit_count
       FROM check_ins ci
       JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
       WHERE ci.user_id = $1
       GROUP BY r.cuisine_type
       ORDER BY visit_count DESC
       LIMIT 5`,
      [userId]
    );
    
    res.json({
      status: 'success',
      data: {
        profile: profileResult.rows[0] || {},
        interactions: interactionResult.rows[0] || {},
        top_cuisines: cuisineResult.rows
      }
    });
  } catch (error) {
    console.error('Error getting insights:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get insights'
    });
  }
};

// Admin: Refresh recommendations for all users
const refreshAllRecommendations = async (req, res) => {
  try {
    // This would typically be a background job
    // For now, just trigger updates for active users
    
    const result = await query(
      `SELECT user_id FROM users 
       WHERE last_active_at > NOW() - INTERVAL '30 days'
       LIMIT 100`
    );
    
    for (const user of result.rows) {
      await generateFreshRecommendations(user.user_id, 20);
    }
    
    res.json({
      status: 'success',
      message: `Refreshed recommendations for ${result.rows.length} users`
    });
  } catch (error) {
    console.error('Error refreshing recommendations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to refresh recommendations'
    });
  }
};

// ===== Helper Functions =====

/** Build a user profile object for AI re-ranking (interests, cuisines, dining history, preferences). */
async function getUserProfileForAI(userId) {
  const userResult = await query(
    `SELECT dietary_tags, conversation_preference, occupation, interests
     FROM users WHERE user_id = $1`,
    [userId]
  );
  const checkInsResult = await query(
    `SELECT DISTINCT ON (r.cuisine_type) r.cuisine_type, r.name, ci.check_in_time
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1
     ORDER BY r.cuisine_type, ci.check_in_time DESC
     LIMIT 20`,
    [userId]
  );
  const user = userResult.rows[0] || {};
  let interests = user.interests || [];
  let dietaryTags = user.dietary_tags || [];
  if (typeof interests === 'string') {
    try { interests = JSON.parse(interests); } catch { interests = []; }
  }
  if (typeof dietaryTags === 'string') {
    try { dietaryTags = JSON.parse(dietaryTags); } catch { dietaryTags = []; }
  }
  const favoriteCuisines = [...new Set(checkInsResult.rows.map(r => r.cuisine_type).filter(Boolean))];
  if (dietaryTags.length) favoriteCuisines.push(...dietaryTags);
  return {
    interests: Array.isArray(interests) ? interests : [interests].filter(Boolean),
    favoriteCuisines: [...new Set(favoriteCuisines)],
    diningHistory: checkInsResult.rows.map(r => r.name),
    preferences: {
      conversationStyle: user.conversation_preference,
      occupation: user.occupation,
    },
  };
}

async function ensureUserTasteProfile(userId) {
  const existing = await query(
    `SELECT 1 FROM user_taste_profiles WHERE user_id = $1`,
    [userId]
  );
  
  if (existing.rows.length === 0) {
    // Create initial profile from user data
    await query(
      `SELECT calculate_user_taste_profile($1)`,
      [userId]
    );
  }
}

async function getCachedRecommendations(userId, type, limit, offset) {
  const result = await query(
    `SELECT 
      rc.*,
      r.name as restaurant_name,
      r.photo_url,
      r.cuisine_type,
      r.price_range,
      r.rating,
      r.address,
      r.city,
      r.latitude,
      r.longitude
     FROM recommendation_cache rc
     JOIN restaurants r ON rc.restaurant_id = r.restaurant_id
     WHERE rc.user_id = $1
     AND rc.recommendation_type = $2
     AND rc.expires_at > NOW()
     AND rc.dismissed = false
     ORDER BY rc.overall_score DESC
     LIMIT $3 OFFSET $4`,
    [userId, type, limit, offset]
  );
  
  return result.rows;
}

async function generateFreshRecommendations(userId, limit) {
  // Call the database function to generate recommendations
  const result = await query(
    `SELECT * FROM generate_recommendations($1, $2)`,
    [userId, limit]
  );
  
  // Insert into cache
  for (const rec of result.rows) {
    await query(
      `INSERT INTO recommendation_cache (
        user_id, recommendation_type, restaurant_id,
        overall_score, reason_type, reason_description,
        expires_at
      ) VALUES ($1, 'for_you', $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
      ON CONFLICT (user_id, recommendation_type, restaurant_id)
      DO UPDATE SET
        overall_score = $3,
        reason_type = $4,
        reason_description = $5,
        computed_at = NOW(),
        expires_at = NOW() + INTERVAL '24 hours'`,
      [userId, rec.restaurant_id, rec.overall_score, rec.reason_type, rec.reason_description]
    );
  }
}

/**
 * Fallback when recommendation engine (taste profile / cache / generate_recommendations) is missing or empty.
 * Returns restaurants the user has NOT checked into, ordered by rating (and optionally by same city/cuisine).
 */
async function getForYouFallback(userId, limitNum) {
  const idsResult = await query(
    `SELECT DISTINCT restaurant_id FROM check_ins WHERE user_id = $1`,
    [userId]
  );
  const excludeIds = idsResult.rows.map((r) => r.restaurant_id).filter(Boolean);
  const hasExclude = excludeIds.length > 0;

  const result = await query(
    `SELECT 
      r.restaurant_id,
      r.name AS restaurant_name,
      r.photo_url,
      r.cuisine_type,
      r.price_range,
      r.rating,
      r.address,
      r.city,
      r.latitude,
      r.longitude
     FROM restaurants r
     WHERE 1=1
     ${hasExclude ? 'AND r.restaurant_id != ALL($2)' : ''}
     ORDER BY r.rating DESC NULLS LAST, r.name
     LIMIT $1`,
    hasExclude ? [limitNum, excludeIds] : [limitNum]
  );

  return result.rows.map((row) => ({
    ...row,
    overall_score: 0.8,
    reason_type: 'for_you',
    reason_description: 'Recommended for you',
  }));
}

async function applyDistanceScoring(recommendations, latitude, longitude) {
  // Simple distance calculation and re-ranking
  const withDistance = recommendations.map(rec => {
    if (rec.latitude && rec.longitude) {
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(rec.latitude),
        parseFloat(rec.longitude)
      );
      
      // Boost score for closer restaurants
      const distanceBoost = Math.max(0, 1 - (distance / 50)); // 50km max boost
      rec.distance_score = distanceBoost;
      rec.distance_km = distance.toFixed(1);
      rec.overall_score = (rec.overall_score * 0.7) + (distanceBoost * 0.3);
    }
    return rec;
  });
  
  // Re-sort by adjusted score
  return withDistance.sort((a, b) => b.overall_score - a.overall_score);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function enrichWithReasoning(recommendations, userId) {
  // Add personalized reasoning to each recommendation
  const profileResult = await query(
    `SELECT cuisine_preferences FROM user_taste_profiles WHERE user_id = $1`,
    [userId]
  );
  
  const profile = profileResult.rows[0];
  
  return recommendations.map(rec => {
    let reason = rec.reason_description || '';
    
    // Add more specific reasoning based on profile
    if (profile && profile.cuisine_preferences) {
      const cuisineScore = profile.cuisine_preferences[rec.cuisine_type];
      if (cuisineScore > 0.5) {
        reason = `Because you enjoy ${rec.cuisine_type} restaurants`;
      }
    }
    
    return {
      ...rec,
      reason: reason,
      match_percentage: Math.round((rec.overall_score || 0) * 100)
    };
  });
}

module.exports = {
  getForYouRecommendations,
  getSimilarTo,
  getTrending,
  getExplore,
  getFriendsLike,
  recordRecommendationFeedback,
  getMyTasteProfile,
  updateTasteProfile,
  getRecommendationInsights,
  refreshAllRecommendations
};
