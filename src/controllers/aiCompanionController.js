const { pool } = require('../config/database');
const aiService = require('../services/aiCompanionService');

async function buildContextSnapshot(userId, { restaurantId, matchId, checkInId }) {
  const snapshot = { restaurant: null, user: null, match: null };

  try {
    const { rows } = await pool.query(
      `SELECT first_name, last_name, bio, interests, conversation_preference
       FROM users WHERE user_id = $1`,
      [userId]
    );
    if (rows[0]) {
      const u = rows[0];
      snapshot.user = {
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'User',
        bio: u.bio,
        interests: u.interests || [],
        favoriteCuisines: [],
        diningStyle: null,
        conversationPreference: u.conversation_preference,
      };
    }
  } catch (_) {}

  if (restaurantId) {
    try {
      const { rows } = await pool.query(
        `SELECT name, cuisine_type, price_range, city FROM restaurants WHERE restaurant_id = $1`,
        [restaurantId]
      );
      if (rows[0]) {
        const r = rows[0];
        snapshot.restaurant = { name: r.name, cuisine: r.cuisine_type, priceRange: r.price_range, city: r.city };
      }
    } catch (_) {}
  }

  if (matchId) {
    try {
      const { rows } = await pool.query(
        `SELECT u.first_name, u.last_name, u.bio, u.interests
         FROM matches m
         JOIN users u ON u.user_id = CASE WHEN m.requester_id = $1 THEN m.receiver_id ELSE m.requester_id END
         WHERE m.match_id = $2`,
        [userId, matchId]
      );
      if (rows[0]) {
        const u = rows[0];
        snapshot.match = {
          otherUserName: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Someone',
          otherUserBio: u.bio,
          otherUserInterests: u.interests || [],
          otherUserCuisines: [],
        };
      }
    } catch (_) {}
  }

  return snapshot;
}

async function loadPreferences(userId) {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_preferences WHERE user_id = $1', [userId]);
    return rows[0] || null;
  } catch (_) {
    return null;
  }
}

exports.startSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionType, matchId, checkInId, restaurantId } = req.body;

    if (!['copilot', 'solo_companion', 'shared_host'].includes(sessionType)) {
      return res.status(400).json({ error: 'Invalid sessionType' });
    }

    await pool.query(
      `UPDATE ai_sessions SET status = 'ended', ended_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    const contextSnapshot = await buildContextSnapshot(userId, { restaurantId, matchId, checkInId });

    const { rows } = await pool.query(
      `INSERT INTO ai_sessions (user_id, session_type, match_id, check_in_id, restaurant_id, context_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, sessionType, matchId || null, checkInId || null, restaurantId || null, JSON.stringify(contextSnapshot)]
    );
    const session = rows[0];

    let initialMessage = null;
    try {
      const preferences = await loadPreferences(userId);
      const greeting = await aiService.generateInitialGreeting(session, preferences);
      if (greeting) {
        const { rows: msgRows } = await pool.query(
          `INSERT INTO ai_messages (session_id, role, content, message_type)
           VALUES ($1, 'assistant', $2, 'greeting')
           RETURNING *`,
          [session.session_id, greeting]
        );
        initialMessage = msgRows[0];
      }
    } catch (err) {
      console.warn('AI greeting generation failed:', err?.message);
    }

    res.json({ session, initialMessage });
  } catch (err) {
    console.error('startSession error:', err);
    res.status(500).json({ error: 'Failed to start AI session' });
  }
};

exports.getActiveSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT * FROM ai_sessions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    res.json({ session: rows[0] || null });
  } catch (err) {
    console.error('getActiveSession error:', err);
    res.status(500).json({ error: 'Failed to get active session' });
  }
};

exports.endSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { rows } = await pool.query(
      `UPDATE ai_sessions SET status = 'ended', ended_at = NOW(), updated_at = NOW()
       WHERE session_id = $1 AND user_id = $2 AND status = 'active'
       RETURNING *`,
      [sessionId, userId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Session not found or already ended' });
    }
    res.json({ session: rows[0] });
  } catch (err) {
    console.error('endSession error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { content, messageType = 'chat' } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const { rows: sessionRows } = await pool.query(
      `SELECT * FROM ai_sessions WHERE session_id = $1 AND user_id = $2 AND status = 'active'`,
      [sessionId, userId]
    );
    if (!sessionRows[0]) {
      return res.status(404).json({ error: 'Active session not found' });
    }
    const session = sessionRows[0];

    const { rows: userMsgRows } = await pool.query(
      `INSERT INTO ai_messages (session_id, role, content, message_type)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [sessionId, content.trim(), messageType]
    );
    const userMessage = userMsgRows[0];

    const { rows: history } = await pool.query(
      `SELECT role, content FROM ai_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    const preferences = await loadPreferences(userId);
    const aiText = await aiService.generateChatResponse(
      session,
      preferences,
      history.slice(0, -1),
      content.trim()
    );

    const { rows: aiMsgRows } = await pool.query(
      `INSERT INTO ai_messages (session_id, role, content, message_type)
       VALUES ($1, 'assistant', $2, 'chat')
       RETURNING *`,
      [sessionId, aiText]
    );

    await pool.query('UPDATE ai_sessions SET updated_at = NOW() WHERE session_id = $1', [sessionId]);

    res.json({ userMessage, aiResponse: aiMsgRows[0] });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before;

    const { rows: sessionRows } = await pool.query(
      'SELECT session_id FROM ai_sessions WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (!sessionRows[0]) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let query = `SELECT * FROM ai_messages WHERE session_id = $1`;
    const params = [sessionId];
    if (before) {
      query += ` AND created_at < $${params.length + 1}`;
      params.push(before);
    }
    query += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json({ messages: rows });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

exports.getSuggestions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId, type } = req.query;

    if (!sessionId || !type) {
      return res.status(400).json({ error: 'sessionId and type are required' });
    }

    const { rows: sessionRows } = await pool.query(
      'SELECT * FROM ai_sessions WHERE session_id = $1 AND user_id = $2 AND status = $3',
      [sessionId, userId, 'active']
    );
    if (!sessionRows[0]) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const preferences = await loadPreferences(userId);
    const content = await aiService.generateSuggestion(sessionRows[0], preferences, type);

    const { rows: msgRows } = await pool.query(
      `INSERT INTO ai_messages (session_id, role, content, message_type, metadata)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING *`,
      [sessionId, content, type, JSON.stringify({ suggestionType: type })]
    );

    res.json({ suggestions: [msgRows[0]] });
  } catch (err) {
    console.error('getSuggestions error:', err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
};

exports.markSuggestionUsed = async (req, res) => {
  try {
    const { messageId } = req.params;
    await pool.query(
      'UPDATE ai_messages SET suggestion_used = true WHERE message_id = $1',
      [messageId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('markSuggestionUsed error:', err);
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
};

function getDefaultPreferences() {
  return {
    copilot_enabled: true,
    solo_companion_enabled: true,
    shared_host_enabled: false,
    ai_personality: 'friendly',
    topics_of_interest: [],
    avoid_topics: [],
    suggestion_frequency: 'moderate',
    avatar_enabled: false,
    selected_avatar_id: null,
    tts_enabled: true,
    tts_voice_id: null,
  };
}

exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const prefs = await loadPreferences(userId);
    res.json({ preferences: prefs || getDefaultPreferences() });
  } catch (err) {
    console.error('getPreferences error:', err);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
};

exports.getAvatars = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT avatar_id, display_name, personality_type, personality_blurb, portrait_url, thumbnail_url, gender_presentation, sort_order
       FROM ai_avatars WHERE is_active = true ORDER BY sort_order, avatar_id`
    );
    const avatars = rows.map((r) => ({
      avatarId: r.avatar_id,
      avatar_id: r.avatar_id,
      displayName: r.display_name,
      display_name: r.display_name,
      personalityType: r.personality_type,
      personality_type: r.personality_type,
      personalityBlurb: r.personality_blurb,
      personality_blurb: r.personality_blurb,
      thumbnailUrl: r.thumbnail_url,
      thumbnail_url: r.thumbnail_url,
      portraitUrl: r.portrait_url,
      portrait_url: r.portrait_url,
      genderPresentation: r.gender_presentation,
      gender_presentation: r.gender_presentation,
    }));
    res.json({ avatars });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ avatars: [] });
    }
    console.error('getAvatars error:', err);
    res.status(500).json({ error: 'Failed to load avatars' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      copilotEnabled,
      soloCompanionEnabled,
      sharedHostEnabled,
      aiPersonality,
      topicsOfInterest,
      avoidTopics,
      suggestionFrequency,
      avatarEnabled,
      selectedAvatarId,
      ttsEnabled,
      ttsVoiceId,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO ai_preferences (
        user_id, copilot_enabled, solo_companion_enabled, shared_host_enabled,
        ai_personality, topics_of_interest, avoid_topics, suggestion_frequency,
        avatar_enabled, selected_avatar_id, tts_enabled, tts_voice_id, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        copilot_enabled = COALESCE($2, ai_preferences.copilot_enabled),
        solo_companion_enabled = COALESCE($3, ai_preferences.solo_companion_enabled),
        shared_host_enabled = COALESCE($4, ai_preferences.shared_host_enabled),
        ai_personality = COALESCE($5, ai_preferences.ai_personality),
        topics_of_interest = COALESCE($6, ai_preferences.topics_of_interest),
        avoid_topics = COALESCE($7, ai_preferences.avoid_topics),
        suggestion_frequency = COALESCE($8, ai_preferences.suggestion_frequency),
        avatar_enabled = COALESCE($9, ai_preferences.avatar_enabled),
        selected_avatar_id = $10,
        tts_enabled = COALESCE($11, ai_preferences.tts_enabled),
        tts_voice_id = $12,
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        copilotEnabled ?? true,
        soloCompanionEnabled ?? true,
        sharedHostEnabled ?? false,
        aiPersonality || 'friendly',
        topicsOfInterest || [],
        avoidTopics || [],
        suggestionFrequency || 'moderate',
        avatarEnabled ?? false,
        selectedAvatarId || null,
        ttsEnabled ?? true,
        ttsVoiceId || null,
      ]
    );

    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error('updatePreferences error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

exports.getCoaching = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: 'matchId is required' });
    }

    const { rows: matchRows } = await pool.query(
      `SELECT m.*, r.name as restaurant_name, r.cuisine_type
       FROM matches m
       LEFT JOIN restaurants r ON r.restaurant_id = m.restaurant_id
       WHERE m.match_id = $1 AND (m.requester_id = $2 OR m.receiver_id = $2)`,
      [matchId, userId]
    );
    if (!matchRows[0]) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const match = matchRows[0];
    const otherUserId = match.requester_id === userId ? match.receiver_id : match.requester_id;

    const { rows: userRows } = await pool.query(
      'SELECT first_name, last_name, bio, interests FROM users WHERE user_id = $1',
      [userId]
    );
    const { rows: otherRows } = await pool.query(
      'SELECT first_name, last_name, bio, interests FROM users WHERE user_id = $1',
      [otherUserId]
    );

    const userProfile = userRows[0] ? { name: [userRows[0].first_name, userRows[0].last_name].filter(Boolean).join(' '), bio: userRows[0].bio, interests: userRows[0].interests || [] } : {};
    const matchProfile = otherRows[0] ? { name: [otherRows[0].first_name, otherRows[0].last_name].filter(Boolean).join(' '), bio: otherRows[0].bio, interests: otherRows[0].interests || [] } : {};

    const coaching = await aiService.generateConversationCoaching(
      userProfile,
      matchProfile,
      { name: match.restaurant_name, cuisine: match.cuisine_type }
    );

    res.json({ coaching, matchId });
  } catch (err) {
    console.error('getCoaching error:', err);
    res.status(500).json({ error: 'Failed to generate coaching tips' });
  }
};

exports.getNudges = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT * FROM ai_nudges WHERE user_id = $1 AND dismissed = false
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );
    res.json({ nudges: rows });
  } catch (err) {
    console.error('getNudges error:', err);
    res.status(500).json({ error: 'Failed to load nudges' });
  }
};

exports.dismissNudge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nudgeId } = req.params;
    await pool.query(
      'UPDATE ai_nudges SET dismissed = true WHERE nudge_id = $1 AND user_id = $2',
      [nudgeId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('dismissNudge error:', err);
    res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
};

exports.actOnNudge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nudgeId } = req.params;
    await pool.query(
      'UPDATE ai_nudges SET acted_on = true WHERE nudge_id = $1 AND user_id = $2',
      [nudgeId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('actOnNudge error:', err);
    res.status(500).json({ error: 'Failed to update nudge' });
  }
};
