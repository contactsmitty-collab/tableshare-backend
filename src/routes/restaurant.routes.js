const express = require('express');
const router = express.Router();
const { query, pool } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { reservationCreateLimiter } = require('../middleware/rateLimit');
const googlePlaces = require('../services/googlePlacesService');
const notificationService = require('../services/notificationService');
const { events } = require('../utils/events');
const { generateRecommendations } = require('../config/openai');

router.get('/', asyncHandler(async (req, res) => {
  const { dietary, city } = req.query;

  let queryText = 'SELECT * FROM restaurants';
  const queryParams = [];
  const conditions = [];

  if (city && String(city).trim()) {
    conditions.push(`(LOWER(TRIM(city)) = LOWER(TRIM($${queryParams.length + 1})))`);
    queryParams.push(String(city).trim());
  }

  // Add dietary filters if provided
  if (dietary) {
    const dietaryFilters = Array.isArray(dietary) ? dietary : [dietary];
    dietaryFilters.forEach((filter) => {
      const columnName = `has_${filter}_options`;
      conditions.push(`${columnName} = true`);
    });
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY COALESCE(rating, 0) DESC, name ASC';

  const result = await query(queryText, queryParams);
  res.json({ restaurants: result.rows });
}));

router.get('/featured', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM restaurants ORDER BY COALESCE(rating, 0) DESC LIMIT 10'
  );
  res.json({ restaurants: result.rows });
}));

// Featured Bars & Nightclubs endpoint
router.get('/featured/bars-nightclubs', asyncHandler(async (req, res) => {
  const { city, lat, lng } = req.query;

  let queryText = `
    SELECT r.*,
           (SELECT COUNT(*) FROM check_ins c WHERE c.restaurant_id = r.restaurant_id AND c.checked_in = true) as active_checkins
    FROM restaurants r
    WHERE r.venue_type IN ('bar', 'nightclub', 'rooftop_bar', 'speakeasy', 'lounge')
  `;
  const queryParams = [];
  let paramCount = 1;

  // Add city filter if provided
  if (city) {
    queryText += ` AND r.city = $${paramCount++}`;
    queryParams.push(city);
  }

  // Add location-based filter if lat/lng provided
  if (lat && lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    queryText += ` AND (6371 * acos(cos(radians($${paramCount++})) * cos(radians(r.latitude))
      * cos(radians(r.longitude) - radians($${paramCount++}))
      + sin(radians($${paramCount - 2})) * sin(radians(r.latitude)))) < 15`;
    queryParams.push(latNum, lngNum);
  }

  queryText += ` ORDER BY COALESCE(r.rating, 0) DESC, RANDOM() LIMIT 15`;

  const result = await query(queryText, queryParams);

  // Group by venue type
  const grouped = {
    bars: result.rows.filter(r => r.venue_type === 'bar'),
    nightclubs: result.rows.filter(r => r.venue_type === 'nightclub'),
    rooftops: result.rows.filter(r => r.venue_type === 'rooftop_bar'),
    all: result.rows
  };

  res.json({
    title: 'Featured Bars & Nightclubs',
    venues: result.rows,
    grouped: grouped,
    count: result.rows.length
  });
}));

router.get('/nearby', asyncHandler(async (req, res) => {
  const { lat, lng, radius, limit } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }

  const restaurants = await googlePlaces.findNearby(
    parseFloat(lat),
    parseFloat(lng),
    parseFloat(radius) || 10,
    parseInt(limit) || 50
  );

  res.json({ restaurants });
}));

router.get('/autocomplete', asyncHandler(async (req, res) => {
  const { input, lat, lng } = req.query;

  if (!input) {
    return res.status(400).json({ error: 'input query parameter is required' });
  }

  const locationBias = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
  const data = await googlePlaces.autocomplete(input, locationBias);

  const suggestions = (data.suggestions || []).map(s => ({
    placeId: s.placePrediction?.placeId,
    name: s.placePrediction?.structuredFormat?.mainText?.text,
    address: s.placePrediction?.structuredFormat?.secondaryText?.text,
    description: s.placePrediction?.text?.text,
  }));

  res.json({ suggestions });
}));

// Search restaurants by name, city, cuisine, or address (must be before /:id so "search" is not treated as id)
router.get('/search', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || (typeof q === 'string' && q.trim() === '')) {
    return res.json({ restaurants: [] });
  }
  const searchTerm = `%${String(q).trim()}%`;
  const result = await query(
    `SELECT * FROM restaurants
     WHERE (is_active IS NULL OR is_active = true)
     AND (name ILIKE $1 OR city ILIKE $1 OR cuisine_type ILIKE $1 OR address ILIKE $1)
     ORDER BY COALESCE(rating, 0) DESC, name ASC
     LIMIT 50`,
    [searchTerm]
  );
  res.json({ restaurants: result.rows });
}));

router.get('/place/:placeId', asyncHandler(async (req, res) => {
  const details = await googlePlaces.getPlaceDetails(req.params.placeId);

  res.json({
    place: {
      placeId: details.id,
      name: details.displayName?.text,
      address: details.formattedAddress,
      lat: details.location?.latitude,
      lng: details.location?.longitude,
      rating: details.rating,
      phone: details.nationalPhoneNumber,
      website: details.websiteUri,
      hours: googlePlaces.formatHours(details.regularOpeningHours),
      priceRange: details.priceLevel ? googlePlaces.mapPriceLevel(details.priceLevel) : null,
      types: details.types,
    },
  });
}));

router.post('/backfill', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const results = await googlePlaces.backfillAll();
  const updated = results.filter(r => r.updated).length;
  const failed = results.filter(r => !r.updated).length;

  res.json({
    message: `Backfill complete: ${updated} updated, ${failed} failed`,
    total: results.length,
    updated,
    failed,
    details: results,
  });
}));

// Live social activity stats for the home screen
router.get('/activity/live', asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const radiusMiles = 15;

  let locationFilter = '';
  let locationParams = [];

  if (lat && lng) {
    locationFilter = `AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND (3959 * acos(
        cos(radians($1)) * cos(radians(r.latitude)) *
        cos(radians(r.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(r.latitude))
      )) <= $3`;
    locationParams = [parseFloat(lat), parseFloat(lng), radiusMiles];
  }

  const [checkInsResult, groupsResult, hotSpotsResult] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT ci.user_id) as diners_nearby
       FROM check_ins ci
       JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
       WHERE ci.is_active = TRUE
         AND ci.check_in_time > NOW() - INTERVAL '4 hours'
         ${locationFilter}`,
      locationParams
    ),
    query(
      `SELECT COUNT(*) as active_groups
       FROM dining_groups dg
       LEFT JOIN restaurants r ON dg.checked_in_restaurant_id = r.restaurant_id
       WHERE dg.is_active = TRUE
         AND dg.checked_in_at > NOW() - INTERVAL '4 hours'
         ${locationFilter}`,
      locationParams
    ),
    query(
      `SELECT r.restaurant_id, r.name, r.cuisine_type, r.address, r.photo_url, r.rating,
              COUNT(ci.check_in_id) as active_checkins
       FROM restaurants r
       JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
       WHERE ci.is_active = TRUE
         AND ci.check_in_time > NOW() - INTERVAL '4 hours'
         ${locationFilter}
       GROUP BY r.restaurant_id
       ORDER BY active_checkins DESC
       LIMIT 5`,
      locationParams
    ),
  ]);

  res.json({
    diners_nearby: parseInt(checkInsResult.rows[0]?.diners_nearby || '0'),
    active_groups: parseInt(groupsResult.rows[0]?.active_groups || '0'),
    hot_spots: hotSpotsResult.rows,
  });
}));

// Vibe-based restaurant discovery (query param: ?vibe=hot&lat=...&lng=...)
router.get('/by-vibe', asyncHandler(async (req, res) => {
  const vibeType = req.query.vibe || '';
  const { lat, lng } = req.query;
  const radiusMiles = 15;

  if (!vibeType) {
    return res.status(400).json({ error: 'vibe query parameter is required (e.g. hot, nightlife, datenight, powerlunch, solo, groups)' });
  }

  let locationFilter = '';
  let locationParams = [];
  let distanceSelect = '';

  if (lat && lng) {
    distanceSelect = `, (3959 * acos(
      cos(radians($1)) * cos(radians(r.latitude)) *
      cos(radians(r.longitude) - radians($2)) +
      sin(radians($1)) * sin(radians(r.latitude))
    )) as distance_miles`;
    locationFilter = `AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND (3959 * acos(
        cos(radians($1)) * cos(radians(r.latitude)) *
        cos(radians(r.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(r.latitude))
      )) <= $3`;
    locationParams = [parseFloat(lat), parseFloat(lng), radiusMiles];
  }

  let vibeQuery = '';
  let vibeTitle = '';

  switch (vibeType) {
    case 'hot':
      vibeTitle = 'Hot Right Now';
      vibeQuery = `SELECT r.*, COUNT(ci.check_in_id) as active_checkins ${distanceSelect}
        FROM restaurants r
        LEFT JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
          AND ci.is_active = TRUE AND ci.check_in_time > NOW() - INTERVAL '4 hours'
        WHERE 1=1 ${locationFilter}
        GROUP BY r.restaurant_id
        ORDER BY active_checkins DESC, COALESCE(r.rating, 0) DESC
        LIMIT 20`;
      break;

    case 'groups':
      vibeTitle = 'Group Dining';
      vibeQuery = `SELECT r.*, COUNT(DISTINCT dg.group_id) as group_count ${distanceSelect}
        FROM restaurants r
        JOIN dining_groups dg ON r.restaurant_id = dg.checked_in_restaurant_id
          AND dg.is_active = TRUE AND dg.checked_in_at > NOW() - INTERVAL '4 hours'
        WHERE 1=1 ${locationFilter}
        GROUP BY r.restaurant_id
        ORDER BY group_count DESC
        LIMIT 20`;
      break;

    case 'nightlife':
      vibeTitle = 'Happy Hour & Nightlife';
      vibeQuery = `SELECT r.* ${distanceSelect}
        FROM restaurants r
        WHERE (LOWER(r.cuisine_type) LIKE '%bar%' OR LOWER(r.cuisine_type) LIKE '%lounge%'
          OR LOWER(r.cuisine_type) LIKE '%cocktail%' OR LOWER(r.cuisine_type) LIKE '%pub%'
          OR LOWER(r.cuisine_type) LIKE '%wine%' OR LOWER(r.cuisine_type) LIKE '%nightlife%'
          OR LOWER(r.name) LIKE '%bar%' OR LOWER(r.name) LIKE '%lounge%'
          OR LOWER(r.name) LIKE '%pub%' OR LOWER(r.name) LIKE '%rooftop%')
          ${locationFilter}
        ORDER BY COALESCE(r.rating, 0) DESC
        LIMIT 20`;
      break;

    case 'datenight':
      vibeTitle = 'Date Night';
      vibeQuery = `SELECT r.* ${distanceSelect}
        FROM restaurants r
        WHERE (r.price_range IN ('$$$', '$$$$') OR COALESCE(r.rating, 0) >= 4.0)
          AND (LOWER(r.cuisine_type) NOT LIKE '%fast%' AND LOWER(r.cuisine_type) NOT LIKE '%pizza%')
          ${locationFilter}
        ORDER BY COALESCE(r.rating, 0) DESC
        LIMIT 20`;
      break;

    case 'powerlunch':
      vibeTitle = 'Power Lunch';
      vibeQuery = `SELECT r.* ${distanceSelect}
        FROM restaurants r
        WHERE (LOWER(r.cuisine_type) LIKE '%american%' OR LOWER(r.cuisine_type) LIKE '%steakhouse%'
          OR LOWER(r.cuisine_type) LIKE '%seafood%' OR LOWER(r.cuisine_type) LIKE '%mediterranean%'
          OR LOWER(r.cuisine_type) LIKE '%new american%' OR LOWER(r.cuisine_type) LIKE '%french%')
          AND r.price_range IN ('$$', '$$$', '$$$$')
          ${locationFilter}
        ORDER BY COALESCE(r.rating, 0) DESC
        LIMIT 20`;
      break;

    case 'solo':
      vibeTitle = 'Solo Friendly';
      vibeQuery = `SELECT r.*, COUNT(ci.check_in_id) as solo_diners ${distanceSelect}
        FROM restaurants r
        LEFT JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
          AND ci.is_active = TRUE AND ci.party_size = 1
          AND ci.check_in_time > NOW() - INTERVAL '4 hours'
        WHERE 1=1 ${locationFilter}
        GROUP BY r.restaurant_id
        ORDER BY solo_diners DESC, COALESCE(r.rating, 0) DESC
        LIMIT 20`;
      break;

    default:
      vibeTitle = 'Restaurants';
      vibeQuery = `SELECT r.* ${distanceSelect}
        FROM restaurants r
        WHERE 1=1 ${locationFilter}
        ORDER BY COALESCE(r.rating, 0) DESC
        LIMIT 20`;
  }

  const result = await query(vibeQuery, locationParams);

  res.json({
    vibe: vibeType,
    title: vibeTitle,
    restaurants: result.rows,
  });
}));

// AI-powered personalized recommendations
router.get('/recommendations/for-you', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { lat, lng, limit = 8 } = req.query;
  const radiusMiles = 15;

  // Get user's profile data
  const userResult = await query(
    `SELECT 
      dietary_tags, conversation_preference, occupation, interests
     FROM users 
     WHERE user_id = $1`,
    [userId]
  );

  // Get user's check-in history for cuisine preferences
  const checkInsResult = await query(
    `SELECT DISTINCT ON (r.cuisine_type) r.cuisine_type, r.name, ci.check_in_time
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.user_id = $1
     ORDER BY r.cuisine_type, ci.check_in_time DESC
     LIMIT 20`,
    [userId]
  );

  // Get nearby restaurants
  let locationFilter = '';
  let locationParams = [];

  if (lat && lng) {
    locationFilter = `WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND (3959 * acos(
        cos(radians($1)) * cos(radians(r.latitude)) *
        cos(radians(r.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(r.latitude))
      )) <= $3`;
    locationParams = [parseFloat(lat), parseFloat(lng), radiusMiles];
  }

  const restaurantsResult = await query(
    `SELECT 
      r.restaurant_id,
      r.name,
      r.cuisine_type,
      r.vibe,
      r.price_range,
      r.rating,
      r.photo_url,
      r.address,
      r.city,
      r.highlights
     FROM restaurants r
     ${locationFilter}
     ORDER BY COALESCE(r.rating, 0) DESC
     LIMIT 50`,
    locationParams
  );

  // Parse user data
  const user = userResult.rows[0] || {};
  let dietaryTags = user.dietary_tags || [];
  let interests = user.interests || [];

  if (typeof dietaryTags === 'string') {
    try { dietaryTags = JSON.parse(dietaryTags); } catch { dietaryTags = []; }
  }
  if (typeof interests === 'string') {
    try { interests = JSON.parse(interests); } catch { interests = []; }
  }

  const userProfile = {
    interests: interests,
    favoriteCuisines: [...new Set(checkInsResult.rows.map(r => r.cuisine_type).filter(Boolean))],
    diningHistory: checkInsResult.rows.map(r => r.name),
    dietaryTags: dietaryTags,
    preferences: {
      conversationStyle: user.conversation_preference,
      occupation: user.occupation
    }
  };

  // If no AI available (DeepSeek or OpenAI), fall back to rating-based sorting
  const hasAI = (process.env.DEEPSEEK_API_KEY || '').trim() ||
    ((process.env.OPENAI_API_KEY || '').trim() && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here');
  if (!hasAI) {
    return res.json({
      recommendations: restaurantsResult.rows.slice(0, parseInt(limit)),
      source: 'rating_based',
      message: 'Showing top-rated restaurants near you'
    });
  }

  try {
    // Use AI to generate recommendations
    const aiRecommendations = await generateRecommendations(
      userProfile,
      restaurantsResult.rows,
      parseInt(limit)
    );

    // Map AI recommendations back to full restaurant data
    const recommendedRestaurants = aiRecommendations
      .map(name => restaurantsResult.rows.find(r => r.name === name))
      .filter(Boolean);

    res.json({
      recommendations: recommendedRestaurants,
      source: 'ai',
      count: recommendedRestaurants.length,
    });
  } catch (error) {
    console.error('AI recommendations error:', error);
    // Fallback to rating-based
    res.json({
      recommendations: restaurantsResult.rows.slice(0, parseInt(limit)),
      source: 'rating_based',
      message: 'Showing top-rated restaurants near you'
    });
  }
}));

// Live Activity - Real-time dining activity in area
router.get('/live-activity', asyncHandler(async (req, res) => {
  const { lat, lng, radius = 5 } = req.query;
  
  let locationFilter = '';
  const params = [];
  
  if (lat && lng) {
    locationFilter = `
      AND (6371 * acos(
        cos(radians($1)) * cos(radians(r.latitude))
        * cos(radians(r.longitude) - radians($2))
        + sin(radians($1)) * sin(radians(r.latitude))
      )) < $3
    `;
    params.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
  }
  
  // Get active diners count
  const dinersResult = await query(
    `SELECT COUNT(DISTINCT ci.user_id) as count
     FROM check_ins ci
     JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
     WHERE ci.is_active = true
     ${locationFilter}`,
    params
  );
  
  // Get hot spots (restaurants with most active check-ins)
  const hotSpotsResult = await query(
    `SELECT r.restaurant_id, r.name, r.photo_url, r.cuisine_type, 
            COUNT(ci.check_in_id) as active_checkins
     FROM restaurants r
     JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
     WHERE ci.is_active = true
     ${locationFilter}
     GROUP BY r.restaurant_id, r.name, r.photo_url, r.cuisine_type
     ORDER BY active_checkins DESC
     LIMIT 5`,
    params
  );
  
  res.json({
    diners_nearby: parseInt(dinersResult.rows[0]?.count || 0),
    active_groups: hotSpotsResult.rows.length,
    hot_spots: hotSpotsResult.rows
  });
}));

// Events happening now
router.get('/events/now', asyncHandler(async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;
  
  let locationFilter = '';
  const params = [new Date().toISOString()];
  let paramIdx = 2;
  
  if (lat && lng) {
    locationFilter = `
      AND (6371 * acos(
        cos(radians($${paramIdx})) * cos(radians(r.latitude))
        * cos(radians(r.longitude) - radians($${paramIdx + 1}))
        + sin(radians($${paramIdx})) * sin(radians(r.latitude))
      )) < $${paramIdx + 2}
    `;
    params.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    paramIdx += 3;
  }
  
  // Check if venue_events table exists
  const tableCheck = await query(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'venue_events')"
  );
  
  if (!tableCheck.rows[0].exists) {
    return res.json([]);
  }
  
  const eventsResult = await query(
    `SELECT ve.*, r.name as restaurant_name, r.photo_url
     FROM venue_events ve
     JOIN restaurants r ON ve.restaurant_id = r.restaurant_id
     WHERE ve.start_time <= $1
     AND (ve.end_time IS NULL OR ve.end_time >= $1)
     ${locationFilter}
     ORDER BY ve.start_time DESC`,
    params
  );
  
  res.json(eventsResult.rows);
}));

// Peak times / TableShare activity at this restaurant (for timing predictions)
router.get('/:id/activity', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const totalResult = await query(
    `SELECT COUNT(*)::int as count
     FROM check_ins
     WHERE restaurant_id = $1 AND check_in_time > NOW() - INTERVAL '90 days'`,
    [id]
  );
  const checkIns90d = totalResult.rows[0]?.count ?? 0;

  if (checkIns90d < 3) {
    return res.json({ check_ins_90d: checkIns90d, summary: null });
  }

  const peakResult = await query(
    `SELECT
       EXTRACT(DOW FROM check_in_time)::int as dow,
       FLOOR(EXTRACT(HOUR FROM check_in_time) / 2)::int * 2 as hour_start,
       COUNT(*)::int as cnt
     FROM check_ins
     WHERE restaurant_id = $1 AND check_in_time > NOW() - INTERVAL '90 days'
     GROUP BY 1, 2
     ORDER BY cnt DESC
     LIMIT 1`,
    [id]
  );
  const peak = peakResult.rows[0];
  if (!peak) {
    return res.json({ check_ins_90d: checkIns90d, summary: null });
  }

  const dow = peak.dow;
  const hourStart = peak.hour_start;
  const cnt = peak.cnt;
  const dayLabel = dow >= 1 && dow <= 5 ? 'weekday' : dow === 0 || dow === 6 ? 'weekend' : 'weekday';
  const timeLabel = hourStart < 12 ? 'morning' : hourStart < 17 ? 'afternoon' : hourStart < 21 ? 'evening' : 'late night';
  const period = dayLabel === 'weekday' && timeLabel === 'evening' ? 'weeknight evenings' : `${dayLabel} ${timeLabel}`;
  const minDiners = Math.max(1, Math.floor(cnt / 2));
  const maxDiners = Math.min(10, cnt + 2);
  const rangeText = minDiners === maxDiners ? `${minDiners}` : `${minDiners}–${maxDiners}`;
  const summary = `Usually ${rangeText} TableShare diner${maxDiners > 1 ? 's' : ''} here on ${period}.`;

  res.json({ check_ins_90d: checkIns90d, summary });
}));

// ============ Category Discovery Endpoints ============

// GET /restaurants/trending - restaurants with most active check-ins right now
router.get('/trending', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT r.*,
           COUNT(c.check_in_id) AS active_users
    FROM restaurants r
    INNER JOIN check_ins c ON c.restaurant_id = r.restaurant_id AND c.checked_in = true
    GROUP BY r.restaurant_id
    ORDER BY active_users DESC
    LIMIT 10
  `);
  res.json({ restaurants: result.rows, updatedAt: new Date().toISOString() });
}));

// GET /restaurants/popular-with-tablesharers - most completed matches
router.get('/popular-with-tablesharers', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = await query(`
    SELECT r.*, COUNT(m.match_id) AS match_count
    FROM restaurants r
    INNER JOIN matches m ON m.restaurant_id = r.restaurant_id
    WHERE m.status IN ('accepted', 'completed')
      AND m.created_at >= NOW() - MAKE_INTERVAL(days => $1)
    GROUP BY r.restaurant_id
    ORDER BY match_count DESC
    LIMIT 10
  `, [days]);
  res.json({ restaurants: result.rows });
}));

// GET /restaurants/category/:category - filter by tag/vibe category
router.get('/category/:category', asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { lat, lng, limit: lim } = req.query;
  const maxResults = parseInt(lim) || 20;

  const tagMap = {
    'brunch': ['brunch'],
    'late-night': ['late_night'],
    'lunch-break': ['quick_service', 'lunch'],
    'hidden-gems': null, // special query
    'outdoor-dining': ['patio', 'rooftop'],
    'communal-seating': ['communal', 'counter_seating', 'ramen_bar'],
    'tapas-small-plates': ['tapas', 'small_plates'],
    'food-halls': ['food_hall', 'food_court'],
    'solo-friendly': ['solo_friendly', 'counter_seating'],
    'business-traveler': ['business_friendly', 'hotel_restaurant'],
    'quiet-company': ['quiet', 'calm'],
  };

  let queryText;
  let queryParams;

  if (category === 'hidden-gems') {
    queryText = `SELECT * FROM restaurants WHERE COALESCE(rating, 0) >= 4.0 ORDER BY rating DESC LIMIT $1`;
    queryParams = [maxResults];
  } else {
    const tags = tagMap[category];
    if (!tags || tags.length === 0) {
      return res.json({ restaurants: [] });
    }
    const tagConditions = tags.map((_, i) => `$${i + 1} = ANY(tags)`).join(' OR ');
    queryText = `SELECT * FROM restaurants WHERE ${tagConditions} ORDER BY COALESCE(rating, 0) DESC LIMIT $${tags.length + 1}`;
    queryParams = [...tags, maxResults];
  }

  const result = await query(queryText, queryParams);
  const seen = new Map();
  const deduped = result.rows.filter((row) => {
    const key = `${(row.name || '').trim().toLowerCase()}|${(row.city || '').trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
  res.json({ restaurants: deduped });
}));

// GET /restaurants/new - added in last 30 days (one per name+city, newest first)
router.get('/new', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT * FROM (
      SELECT DISTINCT ON (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, '')))) *
      FROM restaurants
      WHERE created_at >= NOW() - INTERVAL '30 days'
      ORDER BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, ''))), created_at DESC
    ) sub
    ORDER BY created_at DESC
    LIMIT 15
  `);
  res.json({ restaurants: result.rows });
}));

// GET /restaurants/time-based - restaurants appropriate for current time of day
router.get('/time-based', asyncHandler(async (req, res) => {
  let period = req.query.period;

  if (!period) {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 10) period = 'breakfast';
    else if (hour >= 10 && hour < 13) period = 'brunch';
    else if (hour >= 11 && hour < 15) period = 'lunch';
    else if (hour >= 17 && hour < 22) period = 'dinner';
    else if (hour >= 22 || hour < 2) period = 'late-night';
    else period = 'dinner'; // default fallback
  }

  const periodTags = {
    'breakfast': ['brunch', 'quick_service', 'lunch'],
    'brunch': ['brunch'],
    'lunch': ['lunch', 'quick_service', 'solo_friendly'],
    'dinner': ['business_friendly', 'tapas', 'quiet'],
    'late-night': ['late_night'],
  };

  const tags = periodTags[period] || periodTags['dinner'];
  const tagConditions = tags.map((_, i) => `$${i + 1} = ANY(tags)`).join(' OR ');
  const queryText = `SELECT * FROM restaurants WHERE ${tagConditions} ORDER BY COALESCE(rating, 0) DESC LIMIT 15`;

  const result = await query(queryText, tags);
  res.json({ restaurants: result.rows, period });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM restaurants WHERE restaurant_id = $1',
    [req.params.id]
  );
  res.json({ restaurant: result.rows[0] || null });
}));

// Table Availability & Wait Times API
router.get('/:id/availability', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get current availability data
  const result = await query(
    `SELECT ta.*, r.name as restaurant_name, r.capacity as total_capacity
     FROM table_availability ta
     JOIN restaurants r ON ta.restaurant_id = r.restaurant_id
     WHERE ta.restaurant_id = $1
     ORDER BY ta.updated_at DESC
     LIMIT 1`,
    [id]
  );

  if (result.rows.length === 0) {
    // Return default availability if no data exists
    return res.json({
      restaurant_id: id,
      available_tables: null,
      wait_time_minutes: null,
      status: 'unknown',
      message: 'Availability data not available'
    });
  }

  const availability = result.rows[0];

  // Calculate status based on availability
  let status = 'available';
  if (availability.available_tables === 0) {
    status = availability.wait_time_minutes > 0 ? 'waitlist' : 'full';
  } else if (availability.available_tables < 3) {
    status = 'limited';
  }

  res.json({
    restaurant_id: id,
    available_tables: availability.available_tables,
    wait_time_minutes: availability.wait_time_minutes,
    total_capacity: availability.total_capacity,
    status: status,
    last_updated: availability.updated_at,
    message: status === 'available' ? 'Tables available now' :
             status === 'limited' ? 'Few tables left' :
             status === 'waitlist' ? `Wait time: ${availability.wait_time_minutes} min` :
             'Currently full'
  });
}));

// Update table availability (for restaurant staff/admin)
router.post('/:id/availability', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { available_tables, wait_time_minutes, notes } = req.body;

  // Validate input
  if (available_tables === undefined && wait_time_minutes === undefined) {
    return res.status(400).json({ error: 'available_tables or wait_time_minutes required' });
  }

  // Insert or update availability
  const result = await query(
    `INSERT INTO table_availability (restaurant_id, available_tables, wait_time_minutes, notes, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (restaurant_id) DO UPDATE SET
       available_tables = COALESCE(EXCLUDED.available_tables, table_availability.available_tables),
       wait_time_minutes = COALESCE(EXCLUDED.wait_time_minutes, table_availability.wait_time_minutes),
       notes = COALESCE(EXCLUDED.notes, table_availability.notes),
       updated_at = NOW()
     RETURNING *`,
    [id, available_tables, wait_time_minutes, notes]
  );

  res.json({
    success: true,
    availability: result.rows[0]
  });
}));

// Get availability for multiple restaurants (batch endpoint)
router.post('/availability/batch', asyncHandler(async (req, res) => {
  const { restaurant_ids } = req.body;

  if (!Array.isArray(restaurant_ids) || restaurant_ids.length === 0) {
    return res.status(400).json({ error: 'restaurant_ids array required' });
  }

  const result = await query(
    `SELECT DISTINCT ON (ta.restaurant_id)
       ta.restaurant_id,
       ta.available_tables,
       ta.wait_time_minutes,
       ta.updated_at,
       r.capacity as total_capacity
     FROM table_availability ta
     JOIN restaurants r ON ta.restaurant_id = r.restaurant_id
     WHERE ta.restaurant_id = ANY($1)
     ORDER BY ta.restaurant_id, ta.updated_at DESC`,
    [restaurant_ids]
  );

  // Map to status
  const availabilityMap = result.rows.reduce((acc, row) => {
    let status = 'available';
    if (row.available_tables === 0) {
      status = row.wait_time_minutes > 0 ? 'waitlist' : 'full';
    } else if (row.available_tables < 3) {
      status = 'limited';
    }

    acc[row.restaurant_id] = {
      available_tables: row.available_tables,
      wait_time_minutes: row.wait_time_minutes,
      total_capacity: row.total_capacity,
      status: status,
      last_updated: row.updated_at
    };
    return acc;
  }, {});

  res.json({ availability: availabilityMap });
}));

// Dietary Tags API
router.get('/dietary/tags', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM dietary_tags ORDER BY name ASC');
  res.json({ tags: result.rows });
}));

// Get dietary options for a restaurant
router.get('/:id/dietary', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT dt.*, rdt.verified
     FROM dietary_tags dt
     JOIN restaurant_dietary_tags rdt ON dt.tag_id = rdt.tag_id
     WHERE rdt.restaurant_id = $1`,
    [id]
  );

  // Also get the boolean columns from restaurants table
  const restaurantResult = await query(
    `SELECT has_vegan_options, has_vegetarian_options, has_gluten_free,
            has_halal, has_kosher, has_dairy_free, has_nut_free
     FROM restaurants WHERE restaurant_id = $1`,
    [id]
  );

  res.json({
    tags: result.rows,
    options: restaurantResult.rows[0] || {}
  });
}));

// Update restaurant dietary options (admin/staff only)
router.post('/:id/dietary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    has_vegan_options,
    has_vegetarian_options,
    has_gluten_free,
    has_halal,
    has_kosher,
    has_dairy_free,
    has_nut_free,
    tag_ids
  } = req.body;

  // Update boolean columns
  const updateFields = [];
  const values = [];
  let paramCount = 1;

  if (has_vegan_options !== undefined) {
    updateFields.push(`has_vegan_options = $${paramCount++}`);
    values.push(has_vegan_options);
  }
  if (has_vegetarian_options !== undefined) {
    updateFields.push(`has_vegetarian_options = $${paramCount++}`);
    values.push(has_vegetarian_options);
  }
  if (has_gluten_free !== undefined) {
    updateFields.push(`has_gluten_free = $${paramCount++}`);
    values.push(has_gluten_free);
  }
  if (has_halal !== undefined) {
    updateFields.push(`has_halal = $${paramCount++}`);
    values.push(has_halal);
  }
  if (has_kosher !== undefined) {
    updateFields.push(`has_kosher = $${paramCount++}`);
    values.push(has_kosher);
  }
  if (has_dairy_free !== undefined) {
    updateFields.push(`has_dairy_free = $${paramCount++}`);
    values.push(has_dairy_free);
  }
  if (has_nut_free !== undefined) {
    updateFields.push(`has_nut_free = $${paramCount++}`);
    values.push(has_nut_free);
  }

  if (updateFields.length > 0) {
    values.push(id);
    await query(
      `UPDATE restaurants SET ${updateFields.join(', ')} WHERE restaurant_id = $${paramCount}`,
      values
    );
  }

  // Update tag associations if provided
  if (Array.isArray(tag_ids)) {
    // Remove existing tags
    await query('DELETE FROM restaurant_dietary_tags WHERE restaurant_id = $1', [id]);

    // Add new tags
    for (const tagId of tag_ids) {
      await query(
        `INSERT INTO restaurant_dietary_tags (restaurant_id, tag_id, added_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (restaurant_id, tag_id) DO NOTHING`,
        [id, tagId, req.user?.user_id]
      );
    }
  }

  res.json({ success: true, message: 'Dietary options updated' });
}));

// Events API
router.get('/events/types', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM event_types ORDER BY display_name ASC');
  res.json({ types: result.rows });
}));

// Get events for a specific restaurant
router.get('/:id/events', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { active } = req.query;

  let queryText = `
    SELECT ve.*, et.icon, et.color, et.display_name
    FROM venue_events ve
    JOIN event_types et ON ve.event_type = et.name
    WHERE ve.restaurant_id = $1
  `;
  const values = [id];

  if (active === 'true') {
    queryText += ' AND ve.is_active = true AND (ve.end_time IS NULL OR ve.end_time > NOW())';
  }

  queryText += ' ORDER BY ve.start_time ASC';

  const result = await query(queryText, values);
  res.json({ events: result.rows });
}));

// Get all active events happening now
router.get('/events/happening-now', asyncHandler(async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;

  let queryText = `
    SELECT ve.*, et.icon, et.color, et.display_name,
           r.name as restaurant_name, r.latitude, r.longitude, r.address, r.thumbnail
    FROM venue_events ve
    JOIN event_types et ON ve.event_type = et.name
    JOIN restaurants r ON ve.restaurant_id = r.restaurant_id
    WHERE ve.is_active = true
    AND (ve.end_time IS NULL OR ve.end_time > NOW())
    AND (ve.start_time IS NULL OR ve.start_time <= NOW() + INTERVAL '2 hours')
  `;
  const values = [];

  // Add location filter if coordinates provided
  if (lat && lng) {
    queryText += ` AND (6371 * acos(cos(radians($1)) * cos(radians(r.latitude))
      * cos(radians(r.longitude) - radians($2))
      + sin(radians($1)) * sin(radians(r.latitude)))) < $3`;
    values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
  }

  queryText += ' ORDER BY ve.start_time ASC LIMIT 20';

  const result = await query(queryText, values);
  res.json({ events: result.rows });
}));

// Create new event (admin/staff only)
router.post('/:id/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    event_type,
    title,
    description,
    start_time,
    end_time,
    recurring,
    recurrence_pattern
  } = req.body;

  if (!event_type || !title) {
    return res.status(400).json({ error: 'event_type and title required' });
  }

  const result = await query(
    `INSERT INTO venue_events (restaurant_id, event_type, title, description, start_time, end_time, recurring, recurrence_pattern, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, event_type, title, description, start_time, end_time, recurring || false, recurrence_pattern, req.user?.user_id]
  );

  res.json({ success: true, event: result.rows[0] });
}));

// Filter restaurants by events/features
router.get('/filter/by-events', asyncHandler(async (req, res) => {
  const {
    live_music,
    trivia,
    watch_parties,
    happy_hour,
    brunch,
    late_night,
    karaoke,
    comedy,
    dj,
    lat,
    lng,
    radius = 10
  } = req.query;

  let queryText = 'SELECT * FROM restaurants WHERE 1=1';
  const values = [];
  let paramCount = 1;

  // Add feature filters
  if (live_music === 'true') {
    queryText += ` AND has_live_music = true`;
  }
  if (trivia === 'true') {
    queryText += ` AND has_trivia = true`;
  }
  if (watch_parties === 'true') {
    queryText += ` AND has_watch_parties = true`;
  }
  if (happy_hour === 'true') {
    queryText += ` AND has_happy_hour = true`;
  }
  if (brunch === 'true') {
    queryText += ` AND has_brunch = true`;
  }
  if (late_night === 'true') {
    queryText += ` AND has_late_night = true`;
  }
  if (karaoke === 'true') {
    queryText += ` AND karaoke = true`;
  }
  if (comedy === 'true') {
    queryText += ` AND comedy = true`;
  }
  if (dj === 'true') {
    queryText += ` AND dj = true`;
  }

  // Add location filter
  if (lat && lng) {
    queryText += ` AND (6371 * acos(cos(radians($${paramCount++})) * cos(radians(latitude))
      * cos(radians(longitude) - radians($${paramCount++}))
      + sin(radians($${paramCount - 2})) * sin(radians(latitude)))) < $${paramCount++}`;
    values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
  }

  queryText += ' ORDER BY COALESCE(rating, 0) DESC, name ASC LIMIT 50';

  const result = await query(queryText, values);
  res.json({ restaurants: result.rows });
}));

// ============ RESERVATION API ============

// Get available reservation slots for a restaurant
router.get('/:id/reservations/slots', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, party_size = 2 } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD format)' });
  }

  // Check if restaurant uses external provider
  const restaurantResult = await query(
    'SELECT accepts_reservations, reservation_provider, reservation_provider_id, reservation_url, min_party_size, max_party_size FROM restaurants WHERE restaurant_id = $1',
    [id]
  );

  if (restaurantResult.rows.length === 0) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const restaurant = restaurantResult.rows[0];

  // If external provider, return redirect info
  if (restaurant.reservation_provider && restaurant.reservation_provider !== 'internal') {
    return res.json({
      external_provider: restaurant.reservation_provider,
      external_provider_id: restaurant.reservation_provider_id,
      external_booking_url: restaurant.reservation_url,
      message: `Book through ${restaurant.reservation_provider}`
    });
  }

  // Get available slots from reservation_slots table
  const partySizeNum = parseInt(party_size) || 2;
  const slotsResult = await query(
    `SELECT slot_id, slot_time, party_size_min, party_size_max, available_tables
     FROM reservation_slots
     WHERE restaurant_id = $1
     AND slot_date = $2
     AND is_available = true
     AND party_size_min <= $3
     AND party_size_max >= $3
     AND available_tables > 0
     ORDER BY slot_time ASC`,
    [id, date, partySizeNum]
  );

  let slots = slotsResult.rows;

  // Fallback: when no slots are seeded, return on-the-fly times so booking works without pre-populating reservation_slots
  if (slots.length === 0) {
    const fallbackTimes = [
      '17:00:00', '17:30:00', '18:00:00', '18:30:00',
      '19:00:00', '19:30:00', '20:00:00', '20:30:00',
      '21:00:00', '21:30:00'
    ];
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();
    slots = fallbackTimes
      .map((t) => {
        if (date === todayStr) {
          const [h, m] = t.split(':').map(Number);
          const slotDate = new Date(now);
          slotDate.setHours(h, m, 0, 0);
          if (slotDate <= now) return null;
        }
        return { slot_id: `fallback-${t}`, slot_time: t, party_size_min: 1, party_size_max: 10, available_tables: 1 };
      })
      .filter(Boolean);
  }

  res.json({
    restaurant_id: id,
    date: date,
    party_size: partySizeNum,
    slots,
    external_booking: false
  });
}));

// Create a new reservation
router.post('/:id/reservations', reservationCreateLimiter, authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const {
    reservation_date,
    reservation_time,
    party_size,
    special_requests,
    occasion,
    table_type,
    guest_name,
    guest_phone,
    guest_email
  } = req.body;

  // Validate required fields
  if (!reservation_date || !reservation_time || !party_size) {
    return res.status(400).json({ error: 'reservation_date, reservation_time, and party_size are required' });
  }

  // Check restaurant exists and accepts reservations
  const restaurantResult = await query(
    'SELECT name, accepts_reservations, reservation_provider, max_party_size, min_party_size, reservation_lead_time_hours FROM restaurants WHERE restaurant_id = $1',
    [id]
  );

  if (restaurantResult.rows.length === 0) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const restaurant = restaurantResult.rows[0];

  if (restaurant.accepts_reservations === false) {
    return res.status(400).json({ error: 'This restaurant does not accept reservations' });
  }

  // Validate party size (defaults if null)
  const minParty = restaurant.min_party_size ?? 1;
  const maxParty = restaurant.max_party_size ?? 10;
  if (party_size < minParty || party_size > maxParty) {
    return res.status(400).json({
      error: `Party size must be between ${minParty} and ${maxParty}`
    });
  }

  // Check minimum lead time
  const reservationDateTime = new Date(`${reservation_date}T${reservation_time}`);
  const now = new Date();
  const hoursUntilReservation = (reservationDateTime - now) / (1000 * 60 * 60);

  if (hoursUntilReservation < restaurant.reservation_lead_time_hours) {
    return res.status(400).json({
      error: `Reservations must be made at least ${restaurant.reservation_lead_time_hours} hours in advance`
    });
  }

  const isInternalBooking = !restaurant.reservation_provider || restaurant.reservation_provider === 'internal';
  const confirmationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  if (isInternalBooking) {
    // Normalize time to HH:MM:00 for slot matching (app may send "17:00" or "17:00:00")
    const timeNorm = /^\d{1,2}:\d{2}(:\d{2})?$/.test(reservation_time)
      ? (reservation_time.length <= 5 ? `${reservation_time}:00` : reservation_time)
      : reservation_time;

    const client = await pool.connect();
    let slotConsumed = false;
    try {
      await client.query('BEGIN');
      const slotUpdate = await client.query(
        `UPDATE reservation_slots
         SET available_tables = available_tables - 1, updated_at = NOW()
         WHERE slot_id = (
           SELECT slot_id FROM reservation_slots
           WHERE restaurant_id = $1 AND slot_date = $2 AND slot_time = $3::time
             AND party_size_min <= $4 AND party_size_max >= $4
             AND available_tables > 0 AND is_available = true
           ORDER BY slot_id LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING slot_id`,
        [id, reservation_date, timeNorm, party_size]
      );
      if (slotUpdate.rowCount > 0) {
        slotConsumed = true;
        const result = await client.query(
          `INSERT INTO reservations (
            restaurant_id, user_id, reservation_date, reservation_time, party_size,
            table_type, status, source, special_requests, occasion,
            guest_name, guest_phone, guest_email, confirmation_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *`,
          [
            id, userId, reservation_date, reservation_time, party_size,
            table_type || 'standard', 'confirmed', 'app', special_requests || null,
            occasion || null, guest_name || null, guest_phone || null, guest_email || null,
            confirmationCode
          ]
        );
        await client.query('COMMIT');
        const reservation = result.rows[0];
        res.status(201).json({
          success: true,
          reservation,
          message: `Your table at ${restaurant.name} is confirmed!`,
          confirmation_code: confirmationCode
        });
        notificationService.sendReservationConfirmation(
          userId, restaurant.name, reservation_date, reservation_time, party_size, confirmationCode
        ).catch(err => console.error('Reservation confirmation push failed:', err));
        events.reservation_created(userId, id, reservation.reservation_id, party_size);
        return;
      }
      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    // No slot row found (e.g. fallback slots or not yet seeded): create reservation without decrementing slot
    if (!slotConsumed) {
      // Fall through to "External or fallback" insert below
    }
  }

  // External or fallback: create reservation without slot tracking
  const result = await query(
    `INSERT INTO reservations (
      restaurant_id, user_id, reservation_date, reservation_time, party_size,
      table_type, status, source, special_requests, occasion,
      guest_name, guest_phone, guest_email, confirmation_code
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      id, userId, reservation_date, reservation_time, party_size,
      table_type || 'standard', 'confirmed', 'app', special_requests || null,
      occasion || null, guest_name || null, guest_phone || null, guest_email || null,
      confirmationCode
    ]
  );

  const reservation = result.rows[0];
  res.status(201).json({
    success: true,
    reservation,
    message: `Your table at ${restaurant.name} is confirmed!`,
    confirmation_code: confirmationCode
  });
  notificationService.sendReservationConfirmation(
    userId, restaurant.name, reservation_date, reservation_time, party_size, confirmationCode
  ).catch(err => console.error('Reservation confirmation push failed:', err));
  events.reservation_created(userId, id, reservation.reservation_id, party_size);
}));

// Get user's reservations
router.get('/reservations/my', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { status, upcoming } = req.query;

  let queryText = `
    SELECT r.*, rest.name as restaurant_name, rest.address as restaurant_address,
           rest.photo_url as restaurant_photo, rest.reservation_phone as restaurant_phone
    FROM reservations r
    JOIN restaurants rest ON r.restaurant_id = rest.restaurant_id
    WHERE r.user_id = $1
  `;
  const values = [userId];

  if (status) {
    queryText += ` AND r.status = $${values.length + 1}`;
    values.push(status);
  }

  if (upcoming === 'true') {
    queryText += ` AND r.reservation_date >= CURRENT_DATE AND r.status IN ('pending', 'confirmed', 'seated')`;
  }

  queryText += ' ORDER BY r.reservation_date DESC, r.reservation_time DESC';

  const result = await query(queryText, values);
  res.json({ reservations: result.rows });
}));

// Cancel a reservation
router.patch('/reservations/:reservationId/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const userId = req.user.userId;
  const { reason } = req.body;

  // Verify reservation belongs to user
  const checkResult = await query(
    'SELECT * FROM reservations WHERE reservation_id = $1 AND user_id = $2',
    [reservationId, userId]
  );

  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }

  const reservation = checkResult.rows[0];

  // Check if already cancelled or completed
  if (reservation.status === 'cancelled') {
    return res.status(400).json({ error: 'Reservation is already cancelled' });
  }

  if (reservation.status === 'completed') {
    return res.status(400).json({ error: 'Cannot cancel a completed reservation' });
  }

  // Return capacity to the slot for internal reservations (allow one more booking at that time)
  await query(
    `UPDATE reservation_slots
     SET available_tables = LEAST(available_tables + 1, total_tables), updated_at = NOW()
     WHERE slot_id = (
       SELECT slot_id FROM reservation_slots
       WHERE restaurant_id = $1 AND slot_date = $2 AND slot_time = $3
         AND party_size_min <= $4 AND party_size_max >= $4
         AND available_tables < total_tables
       ORDER BY slot_id LIMIT 1
     )`,
    [
      reservation.restaurant_id,
      reservation.reservation_date,
      reservation.reservation_time,
      reservation.party_size
    ]
  );

  // Update status
  const result = await query(
    `UPDATE reservations
     SET status = 'cancelled', cancelled_at = NOW(), notes = COALESCE(notes, '') || ' Cancellation reason: ' || $1
     WHERE reservation_id = $2
     RETURNING *`,
    [reason || 'No reason provided', reservationId]
  );

  events.reservation_cancelled(userId, reservationId);
  res.json({
    success: true,
    reservation: result.rows[0],
    message: 'Reservation cancelled successfully'
  });
}));

// Get reservation details
router.get('/reservations/:reservationId', authenticateToken, asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `SELECT r.*, rest.name as restaurant_name, rest.address as restaurant_address,
            rest.photo_url as restaurant_photo, rest.reservation_phone as restaurant_phone,
            rest.latitude, rest.longitude
     FROM reservations r
     JOIN restaurants rest ON r.restaurant_id = rest.restaurant_id
     WHERE r.reservation_id = $1 AND r.user_id = $2`,
    [reservationId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }

  res.json({ reservation: result.rows[0] });
}));

// ============ OPEN SEATS / JOIN A TABLE API ============

// Create an open seat offer (host offering seats at their table)
router.post('/open-seats', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const {
    restaurant_id,
    check_in_id,
    available_seats,
    seat_type,
    looking_for,
    age_preference_min,
    age_preference_max,
    vibe_tags,
    occasion,
    notes,
    expires_in_minutes
  } = req.body;

  // Validate required fields
  if (!restaurant_id || !available_seats) {
    return res.status(400).json({ error: 'restaurant_id and available_seats are required' });
  }

  // Verify restaurant exists
  const restaurantResult = await query(
    'SELECT name FROM restaurants WHERE restaurant_id = $1',
    [restaurant_id]
  );

  if (restaurantResult.rows.length === 0) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  // Verify user is checked in at this restaurant (if check_in_id not provided)
  if (!check_in_id) {
    const checkInResult = await query(
      `SELECT check_in_id FROM check_ins
       WHERE user_id = $1 AND restaurant_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, restaurant_id]
    );

    if (checkInResult.rows.length === 0) {
      return res.status(400).json({ error: 'You must be checked in at this restaurant to offer open seats' });
    }
  }

  // Calculate expiration
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + (expires_in_minutes || 120)); // Default 2 hours

  // Create open seat offer
  const result = await query(
    `INSERT INTO open_seats (
      restaurant_id, host_user_id, check_in_id, available_seats, seat_type,
      looking_for, age_preference_min, age_preference_max, vibe_tags,
      occasion, notes, expires_at, latitude, longitude
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      (SELECT latitude FROM restaurants WHERE restaurant_id = $1),
      (SELECT longitude FROM restaurants WHERE restaurant_id = $1)
    ) RETURNING *`,
    [
      restaurant_id, userId, check_in_id, available_seats, seat_type || 'any',
      looking_for || 'anyone', age_preference_min || null, age_preference_max || null,
      vibe_tags || '{}', occasion || null, notes || null, expiresAt
    ]
  );

  res.status(201).json({
    success: true,
    open_seat: result.rows[0],
    message: `You're now offering ${available_seats} open seat${available_seats > 1 ? 's' : ''} at ${restaurantResult.rows[0].name}!`
  });
}));

// Get open seats at a restaurant
router.get('/:id/open-seats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lat, lng, radius } = req.query;

  // First expire any old open seats
  await query(`SELECT expire_old_open_seats()`);

  let queryText = `
    SELECT os.*,
           r.name as restaurant_name, r.address as restaurant_address, r.photo_url as restaurant_photo,
           u.username as host_username, u.first_name as host_first_name, u.last_name as host_last_name,
           u.avatar_url as host_avatar_url, u.age as host_age, u.bio as host_bio,
           (SELECT COUNT(*) FROM seat_requests sr WHERE sr.open_seat_id = os.open_seat_id AND sr.status = 'pending') as pending_request_count
    FROM open_seats os
    JOIN restaurants r ON os.restaurant_id = r.restaurant_id
    JOIN users u ON os.host_user_id = u.user_id
    WHERE os.restaurant_id = $1
    AND os.status = 'open'
    AND os.expires_at > NOW()
  `;
  const values = [id];

  if (lat && lng) {
    queryText = `
      SELECT os.*,
             r.name as restaurant_name, r.address as restaurant_address, r.photo_url as restaurant_photo,
             u.username as host_username, u.first_name as host_first_name, u.last_name as host_last_name,
             u.avatar_url as host_avatar_url, u.age as host_age, u.bio as host_bio,
             (SELECT COUNT(*) FROM seat_requests sr WHERE sr.open_seat_id = os.open_seat_id AND sr.status = 'pending') as pending_request_count,
             (6371 * acos(cos(radians($2)) * cos(radians(os.latitude)) * cos(radians(os.longitude) - radians($3)) + sin(radians($2)) * sin(radians(os.latitude)))) as distance_km
      FROM open_seats os
      JOIN restaurants r ON os.restaurant_id = r.restaurant_id
      JOIN users u ON os.host_user_id = u.user_id
      WHERE os.restaurant_id = $1
      AND os.status = 'open'
      AND os.expires_at > NOW()
    `;
    values.push(lat, lng);

    if (radius) {
      queryText += ` AND (6371 * acos(cos(radians($2)) * cos(radians(os.latitude)) * cos(radians(os.longitude) - radians($3)) + sin(radians($2)) * sin(radians(os.latitude)))) <= $${values.length + 1}`;
      values.push(parseFloat(radius));
    }
  }

  queryText += ' ORDER BY os.created_at DESC';

  const result = await query(queryText, values);
  res.json({ open_seats: result.rows });
}));

// Request to join an open seat
router.post('/open-seats/:openSeatId/request', authenticateToken, asyncHandler(async (req, res) => {
  const { openSeatId } = req.params;
  const userId = req.user.userId;
  const { message, party_size } = req.body;

  // Check if open seat exists and is available
  const openSeatResult = await query(
    `SELECT os.*, r.name as restaurant_name, u.username as host_username
     FROM open_seats os
     JOIN restaurants r ON os.restaurant_id = r.restaurant_id
     JOIN users u ON os.host_user_id = u.user_id
     WHERE os.open_seat_id = $1 AND os.status = 'open' AND os.expires_at > NOW()`,
    [openSeatId]
  );

  if (openSeatResult.rows.length === 0) {
    return res.status(404).json({ error: 'Open seat not found or no longer available' });
  }

  const openSeat = openSeatResult.rows[0];

  // Can't request your own seat
  if (openSeat.host_user_id === userId) {
    return res.status(400).json({ error: 'You cannot request to join your own table' });
  }

  // Check if enough seats available for party size
  const requestedSeats = party_size || 1;
  if (requestedSeats > openSeat.available_seats) {
    return res.status(400).json({ error: `Only ${openSeat.available_seats} seat(s) available` });
  }

  // Create seat request
  const result = await query(
    `INSERT INTO seat_requests (open_seat_id, requester_user_id, message, party_size)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (open_seat_id, requester_user_id) DO UPDATE
     SET message = EXCLUDED.message, party_size = EXCLUDED.party_size, status = 'pending', created_at = NOW()
     RETURNING *`,
    [openSeatId, userId, message || null, requestedSeats]
  );

  res.status(201).json({
    success: true,
    seat_request: result.rows[0],
    message: `Request sent to ${openSeat.host_username}!`
  });
}));

// Get my open seats (as host)
router.get('/open-seats/my/hosting', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  // Expire old open seats first
  await query(`SELECT expire_old_open_seats()`);

  const result = await query(
    `SELECT os.*,
            r.name as restaurant_name, r.photo_url as restaurant_photo,
            (SELECT COUNT(*) FROM seat_requests sr WHERE sr.open_seat_id = os.open_seat_id AND sr.status = 'pending') as pending_request_count
     FROM open_seats os
     JOIN restaurants r ON os.restaurant_id = r.restaurant_id
     WHERE os.host_user_id = $1
     AND os.status IN ('open', 'pending')
     ORDER BY os.created_at DESC`,
    [userId]
  );

  res.json({ open_seats: result.rows });
}));

// Get my seat requests (as requester)
router.get('/open-seats/my/requests', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT sr.*,
            os.restaurant_id, os.available_seats, os.notes as host_notes, os.occasion,
            os.host_user_id,
            r.name as restaurant_name, r.photo_url as restaurant_photo,
            u.username as host_username, u.first_name as host_first_name, u.avatar_url as host_avatar_url
     FROM seat_requests sr
     JOIN open_seats os ON sr.open_seat_id = os.open_seat_id
     JOIN restaurants r ON os.restaurant_id = r.restaurant_id
     JOIN users u ON os.host_user_id = u.user_id
     WHERE sr.requester_user_id = $1
     ORDER BY sr.created_at DESC`,
    [userId]
  );

  res.json({ requests: result.rows });
}));

// Respond to a seat request (approve/decline)
router.patch('/seat-requests/:requestId/respond', authenticateToken, asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.userId;
  const { action, response_message } = req.body; // action: 'approve' or 'decline'

  if (!action || !['approve', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "decline"' });
  }

  // Verify the open seat belongs to this user
  const checkResult = await query(
    `SELECT sr.*, os.host_user_id, os.available_seats, os.open_seat_id, os.restaurant_id
     FROM seat_requests sr
     JOIN open_seats os ON sr.open_seat_id = os.open_seat_id
     WHERE sr.seat_request_id = $1`,
    [requestId]
  );

  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: 'Seat request not found' });
  }

  const request = checkResult.rows[0];

  if (request.host_user_id !== userId) {
    return res.status(403).json({ error: 'You can only respond to requests for your own open seats' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'This request has already been responded to' });
  }

  // Update request status
  const newStatus = action === 'approve' ? 'approved' : 'declined';
  const result = await query(
    `UPDATE seat_requests
     SET status = $1, response_message = $2, responded_at = NOW()
     WHERE seat_request_id = $3
     RETURNING *`,
    [newStatus, response_message || null, requestId]
  );

  // If approved, reduce available seats
  if (action === 'approve') {
    const newAvailable = request.available_seats - request.party_size;
    const newOpenSeatStatus = newAvailable <= 0 ? 'filled' : 'open';

    await query(
      `UPDATE open_seats
       SET available_seats = $1, status = $2, filled_at = CASE WHEN $2 = 'filled' THEN NOW() ELSE filled_at END
       WHERE open_seat_id = $3`,
      [Math.max(0, newAvailable), newOpenSeatStatus, request.open_seat_id]
    );
  }

  res.json({
    success: true,
    seat_request: result.rows[0],
    message: action === 'approve' ? 'Request approved!' : 'Request declined'
  });
}));

// Cancel my open seat offer
router.patch('/open-seats/:openSeatId/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { openSeatId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `UPDATE open_seats
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE open_seat_id = $1 AND host_user_id = $2 AND status IN ('open', 'pending')
     RETURNING *`,
    [openSeatId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Open seat not found or not yours to cancel' });
  }

  // Decline all pending requests
  await query(
    `UPDATE seat_requests
     SET status = 'declined', response_message = 'Host cancelled the open seat offer', responded_at = NOW()
     WHERE open_seat_id = $1 AND status = 'pending'`,
    [openSeatId]
  );

  res.json({ success: true, message: 'Open seat offer cancelled' });
}));

// Cancel my seat request
router.patch('/seat-requests/:requestId/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `UPDATE seat_requests
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE seat_request_id = $1 AND requester_user_id = $2 AND status = 'pending'
     RETURNING *`,
    [requestId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Request not found or cannot be cancelled' });
  }

  res.json({ success: true, message: 'Seat request cancelled' });
}));

// Get nearby open seats (discovery feature)
router.get('/open-seats/nearby/discover', asyncHandler(async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  // Expire old open seats first
  await query(`SELECT expire_old_open_seats()`);

  const result = await query(
    `SELECT os.*,
            r.name as restaurant_name, r.address as restaurant_address, r.photo_url as restaurant_photo,
            u.username as host_username, u.first_name as host_first_name, u.avatar_url as host_avatar_url,
            u.age as host_age,
            (6371 * acos(cos(radians($1)) * cos(radians(os.latitude)) * cos(radians(os.longitude) - radians($2)) + sin(radians($1)) * sin(radians(os.latitude)))) as distance_km
     FROM open_seats os
     JOIN restaurants r ON os.restaurant_id = r.restaurant_id
     JOIN users u ON os.host_user_id = u.user_id
     WHERE os.status = 'open'
     AND os.expires_at > NOW()
     AND (6371 * acos(cos(radians($1)) * cos(radians(os.latitude)) * cos(radians(os.longitude) - radians($2)) + sin(radians($1)) * sin(radians(os.latitude)))) <= $3
     ORDER BY distance_km ASC, os.created_at DESC
     LIMIT 50`,
    [lat, lng, parseFloat(radius)]
  );

  res.json({ open_seats: result.rows });
}));

// ============ VIRTUAL QUEUE / WAITLIST API ============

// Get waitlist status for a restaurant
router.get('/:id/waitlist', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Expire old entries first - never let this 500 the GET (swallow all errors)
  try {
    await query(`SELECT expire_old_waitlist_entries()`);
  } catch (_e) {
    // ignore: unique_active_waitlist or any other expire failure
  }

  try {
    // Get restaurant waitlist info
    const restaurantResult = await query(
      'SELECT has_waitlist, waitlist_max_party_size, waitlist_notes, avg_turn_time_minutes FROM restaurants WHERE restaurant_id = $1',
      [id]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const restaurant = restaurantResult.rows[0];

    // Get current waitlist count and stats
    const statsResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
        COUNT(*) FILTER (WHERE status = 'notified') as notified_count,
        AVG(party_size) FILTER (WHERE status = 'waiting') as avg_party_size,
        MAX(joined_at) as oldest_entry
       FROM waitlist_entries WHERE restaurant_id = $1`,
      [id]
    );

    const stats = statsResult.rows[0];

    return res.json({
      restaurant_id: id,
      accepts_waitlist: restaurant.has_waitlist !== false,
      max_party_size: restaurant.waitlist_max_party_size,
      waitlist_notes: restaurant.waitlist_notes,
      current_stats: {
        waiting_count: parseInt(stats.waiting_count) || 0,
        notified_count: parseInt(stats.notified_count) || 0,
        estimated_wait_minutes: (parseInt(stats.waiting_count) || 0) * (restaurant.avg_turn_time_minutes || 60) / 2,
      }
    });
  } catch (err) {
    const msg = String(err?.message || '');
    const code = String(err?.code || '');
    const isWaitlistConstraint = code === '23505' || /unique_active_waitlist|duplicate key|unique constraint/.test(msg);
    if (isWaitlistConstraint) {
      return res.json({
        restaurant_id: id,
        accepts_waitlist: true,
        max_party_size: 10,
        waitlist_notes: null,
        current_stats: { waiting_count: 0, notified_count: 0, estimated_wait_minutes: 0 }
      });
    }
    throw err;
  }
}));

// Join the waitlist
router.post('/:id/waitlist/join', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log('DEBUG waitlist join - req.user:', req.user);
  const userId = req.user?.userId || req.user?.user_id;
  console.log('DEBUG waitlist join - userId:', userId);
  const {
    party_size,
    party_name,
    table_type_preference,
    seating_preference,
    special_requests,
    notification_method
  } = req.body;

  // Validate
  if (!party_size || party_size < 1) {
    return res.status(400).json({ error: 'party_size is required' });
  }

  // Check restaurant
  const restaurantResult = await query(
    'SELECT name, has_waitlist, waitlist_max_party_size FROM restaurants WHERE restaurant_id = $1',
    [id]
  );

  if (restaurantResult.rows.length === 0) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const restaurant = restaurantResult.rows[0];

  if (restaurant.has_waitlist === false) {
    return res.status(400).json({ error: 'This restaurant does not use a waitlist' });
  }

  if (party_size > restaurant.waitlist_max_party_size) {
    return res.status(400).json({ error: `Party size exceeds maximum of ${restaurant.waitlist_max_party_size}` });
  }

  // Check if user already has active waitlist at this restaurant
  const existingResult = await query(
    `SELECT waitlist_id FROM waitlist_entries
     WHERE restaurant_id = $1 AND user_id = $2 AND status IN ('waiting', 'notified')`,
    [id, userId]
  );

  if (existingResult.rows.length > 0) {
    return res.status(400).json({ error: 'You are already on the waitlist at this restaurant' });
  }

  // Calculate queue position and estimated wait
  const positionResult = await query(
    `SELECT COUNT(*) + 1 as position FROM waitlist_entries
     WHERE restaurant_id = $1 AND status = 'waiting'`,
    [id]
  );

  const position = parseInt(positionResult.rows[0].position);
  const estimatedMinutes = position * 15; // 15 min per table avg

  // Create waitlist entry (catch duplicate so we return 400 instead of 500)
  let result;
  try {
    result = await query(
      `INSERT INTO waitlist_entries (
        restaurant_id, user_id, party_size, party_name,
        table_type_preference, seating_preference, special_requests,
        notification_method, queue_position, quoted_wait_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id, userId, party_size, party_name || null,
        table_type_preference || 'any', seating_preference || '{}', special_requests || null,
        notification_method || 'push', position, estimatedMinutes
      ]
    );
  } catch (err) {
    // Unique index unique_active_waitlist: one active entry per user per restaurant.
    const isDuplicate = String(err?.code) === '23505' || /unique_active_waitlist|duplicate key/.test(String(err?.message || ''));
    if (isDuplicate) {
      return res.status(400).json({ error: 'You are already on the waitlist at this restaurant' });
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    waitlist: result.rows[0],
    message: `You're #${position} in line at ${restaurant.name}. Estimated wait: ${estimatedMinutes} minutes.`,
    estimated_wait_minutes: estimatedMinutes,
    queue_position: position
  });
}));

// Get my waitlist entries
router.get('/waitlist/my', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  // Expire old entries - never let this 500 the GET (swallow all errors)
  try {
    await query(`SELECT expire_old_waitlist_entries()`);
  } catch (_e) {
    // ignore: unique_active_waitlist or any other expire failure
  }

  try {
    const result = await query(
      `SELECT w.*,
              r.name as restaurant_name, r.address as restaurant_address, r.photo_url as restaurant_photo,
              calculate_queue_position(w.restaurant_id, w.waitlist_id) as current_position,
              estimate_wait_time(w.restaurant_id, calculate_queue_position(w.restaurant_id, w.waitlist_id)) as estimated_minutes_remaining
       FROM waitlist_entries w
       JOIN restaurants r ON w.restaurant_id = r.restaurant_id
       WHERE w.user_id = $1
       AND w.status IN ('waiting', 'notified')
       ORDER BY w.joined_at DESC`,
      [userId]
    );

    return res.json({ waitlist: result.rows });
  } catch (err) {
    if (String(err?.code) === '23505' || /unique_active_waitlist/.test(String(err?.message || ''))) {
      return res.json({ waitlist: [] });
    }
    throw err;
  }
}));

// Check my position in waitlist
router.get('/waitlist/:waitlistId/status', authenticateToken, asyncHandler(async (req, res) => {
  const { waitlistId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `SELECT w.*,
            r.name as restaurant_name, r.photo_url as restaurant_photo,
            calculate_queue_position(w.restaurant_id, w.waitlist_id) as current_position,
            estimate_wait_time(w.restaurant_id, calculate_queue_position(w.restaurant_id, w.waitlist_id)) as estimated_minutes_remaining
     FROM waitlist_entries w
     JOIN restaurants r ON w.restaurant_id = r.restaurant_id
     WHERE w.waitlist_id = $1 AND w.user_id = $2`,
    [waitlistId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Waitlist entry not found' });
  }

  res.json({ waitlist: result.rows[0] });
}));

// Leave/Cancel waitlist
router.patch('/waitlist/:waitlistId/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { waitlistId } = req.params;
  const userId = req.user.userId;
  const { reason } = req.body;

  const result = await query(
    `UPDATE waitlist_entries
     SET status = 'cancelled',
         cancelled_at = NOW(),
         cancellation_reason = $1
     WHERE waitlist_id = $2 AND user_id = $3 AND status IN ('waiting', 'notified')
     RETURNING *`,
    [reason || 'user_cancelled', waitlistId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Waitlist entry not found or cannot be cancelled' });
  }

  res.json({ success: true, message: 'You have left the waitlist' });
}));

// Confirm table ready (for when notified)
router.patch('/waitlist/:waitlistId/confirm', authenticateToken, asyncHandler(async (req, res) => {
  const { waitlistId } = req.params;
  const userId = req.user.userId;

  const result = await query(
    `UPDATE waitlist_entries
     SET status = 'seated', seated_at = NOW()
     WHERE waitlist_id = $1 AND user_id = $2 AND status = 'notified'
     RETURNING *`,
    [waitlistId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Table not ready or already confirmed' });
  }

  res.json({ success: true, message: 'Enjoy your meal! Please check in when seated.' });
}));

module.exports = router;
