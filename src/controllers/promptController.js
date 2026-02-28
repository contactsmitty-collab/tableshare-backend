const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { generateConversationStarters, generateContextualConversationStarters } = require('../config/openai');

// Get contextual conversation starters for a match (both users' profiles + restaurant)
const getContextualPrompts = asyncHandler(async (req, res) => {
  const { match_id: matchId, count = 8 } = req.query;
  const userId = req.user.userId;

  if (!matchId) {
    throw new AppError('match_id is required for contextual prompts', 400);
  }

  const matchResult = await query(
    `SELECT m.match_id, m.requester_id, m.receiver_id, m.restaurant_id,
            r.name as restaurant_name, r.cuisine_type
     FROM matches m
     JOIN restaurants r ON m.restaurant_id = r.restaurant_id
     WHERE m.match_id = $1 AND (m.requester_id = $2 OR m.receiver_id = $2)
       AND m.status IN ('accepted', 'completed')`,
    [matchId, userId]
  );

  if (matchResult.rows.length === 0) {
    throw new AppError('Match not found or access denied', 404);
  }

  const match = matchResult.rows[0];
  const otherUserId = match.requester_id === userId ? match.receiver_id : match.requester_id;

  const usersResult = await query(
    `SELECT user_id, bio, conversation_preference, dietary_tags
     FROM users WHERE user_id IN ($1, $2)`,
    [userId, otherUserId]
  );

  const me = usersResult.rows.find(r => r.user_id === userId);
  const other = usersResult.rows.find(r => r.user_id === otherUserId);

  const parseDietary = (tags) => {
    if (!tags) return '';
    if (typeof tags === 'string') {
      try {
        const arr = JSON.parse(tags);
        return Array.isArray(arr) ? arr.join(', ') : tags;
      } catch {
        return tags;
      }
    }
    return Array.isArray(tags) ? tags.join(', ') : '';
  };

  const matchContext = {
    restaurantName: match.restaurant_name || 'the restaurant',
    cuisineType: match.cuisine_type || '',
    myBio: (me && me.bio) ? me.bio : '',
    myConversationPreference: (me && me.conversation_preference) ? me.conversation_preference : 'flexible',
    otherBio: (other && other.bio) ? other.bio : '',
    otherConversationPreference: (other && other.conversation_preference) ? other.conversation_preference : 'flexible',
    myDietary: parseDietary(me && me.dietary_tags),
    otherDietary: parseDietary(other && other.dietary_tags),
  };

  try {
    const prompts = await generateContextualConversationStarters(matchContext, parseInt(count) || 8);
    return res.json({
      prompts,
      count: prompts.length,
      source: 'ai',
      category: 'contextual',
    });
  } catch (error) {
    console.error('Contextual prompt generation failed, falling back to database:', error);
    const result = await query(
      `SELECT prompt_id, prompt_text, category, context, cuisine_type, time_of_day, usage_count
       FROM conversation_prompts
       WHERE is_active = TRUE AND category = 'general'
       ORDER BY usage_count DESC, RANDOM() LIMIT $1`,
      [parseInt(count) || 8]
    );
    return res.json({
      prompts: result.rows,
      count: result.rows.length,
      source: 'database',
      category: 'general',
      error: 'Contextual AI failed, using database fallback',
    });
  }
});

// Generate AI-powered conversation starters
const generateAIPrompts = asyncHandler(async (req, res) => {
  const { category, restaurant_name, count = 5 } = req.query;

  if (!category) {
    throw new AppError('Category is required for AI generation', 400);
  }

  const validCategories = ['food', 'lifestyle', 'dating', 'chicago', 'networking', 'general'];
  if (!validCategories.includes(category)) {
    throw new AppError(`Invalid category. Must be one of: ${validCategories.join(', ')}`, 400);
  }

  try {
    const prompts = await generateConversationStarters(
      category,
      restaurant_name || 'the restaurant',
      parseInt(count)
    );

    res.json({
      prompts,
      count: prompts.length,
      source: 'ai',
      category,
    });
  } catch (error) {
    console.error('AI prompt generation error:', error);
    // Fallback to database prompts
    const result = await query(
      `SELECT 
        prompt_id,
        prompt_text,
        category,
        context,
        cuisine_type,
        time_of_day,
        usage_count
      FROM conversation_prompts
      WHERE is_active = TRUE AND category = $1
      ORDER BY usage_count DESC, RANDOM() LIMIT $2`,
      [category, parseInt(count)]
    );

    res.json({
      prompts: result.rows,
      count: result.rows.length,
      source: 'database',
      category,
      error: 'AI generation failed, using database fallback',
    });
  }
});

// Get conversation prompts (with optional AI generation)
const getPrompts = asyncHandler(async (req, res) => {
  const {
    category,
    context = 'first_message',
    cuisine_type,
    time_of_day,
    limit = 10,
    ai = false,
    restaurant_name,
  } = req.query;

  const userId = req.user.userId;
  const matchId = req.query.match_id || null;

  // If AI generation is requested
  if (ai === 'true' && category) {
    try {
      const prompts = await generateConversationStarters(
        category,
        restaurant_name || 'the restaurant',
        parseInt(limit)
      );

      return res.json({
        prompts,
        count: prompts.length,
        source: 'ai',
        category,
      });
    } catch (error) {
      console.error('AI prompt generation failed, falling back to database:', error);
      // Continue to database fallback
    }
  }

  // Build query
  let queryText = `
    SELECT 
      prompt_id,
      prompt_text,
      category,
      context,
      cuisine_type,
      time_of_day,
      usage_count
    FROM conversation_prompts
    WHERE is_active = TRUE
  `;
  const queryParams = [];
  let paramCount = 1;

  // Add filters
  if (category && category !== 'all') {
    queryText += ` AND category = $${paramCount}`;
    queryParams.push(category);
    paramCount++;
  }

  if (context) {
    queryText += ` AND (context = $${paramCount} OR context = 'any')`;
    queryParams.push(context);
    paramCount++;
  }

  if (cuisine_type) {
    queryText += ` AND (cuisine_type = $${paramCount} OR cuisine_type IS NULL)`;
    queryParams.push(cuisine_type);
    paramCount++;
  }

  if (time_of_day) {
    const currentHour = new Date().getHours();
    let currentTimeOfDay = 'any';
    if (currentHour >= 5 && currentHour < 12) {
      currentTimeOfDay = 'morning';
    } else if (currentHour >= 12 && currentHour < 17) {
      currentTimeOfDay = 'afternoon';
    } else if (currentHour >= 17) {
      currentTimeOfDay = 'evening';
    }

    queryText += ` AND (time_of_day = $${paramCount} OR time_of_day = 'any')`;
    queryParams.push(time_of_day === 'current' ? currentTimeOfDay : time_of_day);
    paramCount++;
  }

  // Order by usage count (popular prompts first), then random
  queryText += ` ORDER BY usage_count DESC, RANDOM() LIMIT $${paramCount}`;
  queryParams.push(parseInt(limit));

  const result = await query(queryText, queryParams);

  res.json({
    prompts: result.rows,
    count: result.rows.length,
    source: 'database',
  });
});

// Track prompt usage
const trackPromptUsage = asyncHandler(async (req, res) => {
  const { prompt_id, match_id } = req.body;
  const userId = req.user.userId;

  if (!prompt_id) {
    throw new AppError('Prompt ID is required', 400);
  }

  // Verify prompt exists
  const promptCheck = await query(
    'SELECT prompt_id FROM conversation_prompts WHERE prompt_id = $1 AND is_active = TRUE',
    [prompt_id]
  );

  if (promptCheck.rows.length === 0) {
    throw new AppError('Prompt not found', 404);
  }

  // Record usage
  await query(
    `INSERT INTO prompt_usage (prompt_id, user_id, match_id)
     VALUES ($1, $2, $3)`,
    [prompt_id, userId, match_id || null]
  );

  // Increment usage count
  await query(
    'UPDATE conversation_prompts SET usage_count = usage_count + 1 WHERE prompt_id = $1',
    [prompt_id]
  );

  res.json({
    message: 'Prompt usage tracked',
  });
});

// Get prompt by ID (for sending the actual text)
const getPromptById = asyncHandler(async (req, res) => {
  const { promptId } = req.params;

  const result = await query(
    'SELECT prompt_id, prompt_text, category FROM conversation_prompts WHERE prompt_id = $1 AND is_active = TRUE',
    [promptId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Prompt not found', 404);
  }

  res.json({
    prompt: result.rows[0],
  });
});

module.exports = {
  getPrompts,
  trackPromptUsage,
  getPromptById,
  generateAIPrompts,
  getContextualPrompts,
};
