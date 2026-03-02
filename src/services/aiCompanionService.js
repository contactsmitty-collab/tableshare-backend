/**
 * AI Companion Service
 * Handles all AI generation for the companion feature:
 *   - Chat responses (solo companion, copilot, shared host)
 *   - Quick-action suggestions (menu tips, games, fun facts, topics)
 *   - Proactive nudges / smart notifications
 *   - Pre-match conversation coaching
 */

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

async function chatCompletion(systemContent, messages, opts = {}) {
  const { maxTokens = 600, temperature = 0.8 } = opts;
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  const allMessages = [{ role: 'system', content: systemContent }, ...messages];

  if (deepseekKey) {
    try {
      const ds = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        apiKey: deepseekKey,
      });
      const res = await ds.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: allMessages,
        temperature,
        max_tokens: maxTokens,
      });
      const text = res.choices?.[0]?.message?.content;
      if (text) return text;
    } catch (err) {
      console.warn('AI Companion DeepSeek error, falling back:', err?.message);
    }
  }

  if (openaiKey) {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      temperature,
      max_tokens: maxTokens,
    });
    return res.choices?.[0]?.message?.content || '';
  }

  throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
}

function buildSystemPrompt(session, preferences) {
  const personality = preferences?.ai_personality || 'friendly';
  const ctx = session.context_snapshot || {};
  const restaurant = ctx.restaurant || {};
  const user = ctx.user || {};

  const personalityTraits = {
    friendly: 'You are warm, encouraging, and conversational. You make people feel comfortable.',
    witty: 'You are clever and playful with a great sense of humor. You keep things fun and light.',
    intellectual: 'You enjoy deeper discussions about culture, ideas, and experiences. You are thoughtful and curious.',
    chill: 'You are laid-back and easy-going. You keep the vibe relaxed and low-pressure.',
  };

  const avoidTopics = preferences?.avoid_topics?.length
    ? `\nAvoid these topics: ${preferences.avoid_topics.join(', ')}.`
    : '';

  const interestTopics = preferences?.topics_of_interest?.length
    ? `\nThe user is interested in: ${preferences.topics_of_interest.join(', ')}.`
    : '';

  let base = `You are TableShare's AI Dining Companion. ${personalityTraits[personality] || personalityTraits.friendly}

You are helping someone enjoy their dining experience at ${restaurant.name || 'a restaurant'}${restaurant.cuisine ? ` (${restaurant.cuisine} cuisine)` : ''}.

Key rules:
- Keep responses concise (2-4 sentences unless asked for more)
- Be a great dining companion — engaging, interesting, and fun
- You can discuss the menu, cuisine, dining etiquette, fun facts, and conversation topics
- Never give medical or allergy advice — suggest asking the server
- Always maintain platonic, appropriate conversation
- You are clearly an AI companion, never pretend to be human
${avoidTopics}${interestTopics}`;

  if (session.session_type === 'solo_companion') {
    base += `\n\nThis person is dining solo. Be an especially engaging companion — share interesting stories, ask thoughtful questions, suggest menu items, and make the experience enjoyable. Think of yourself as the best dinner companion.`;
  } else if (session.session_type === 'copilot') {
    base += `\n\nYou are a conversation copilot for a matched dining pair. Suggest conversation topics, icebreakers, and shared activities. Help keep the conversation flowing without being intrusive. Only respond when asked.`;
  } else if (session.session_type === 'shared_host') {
    base += `\n\nYou are hosting a shared dining experience. You help moderate conversation, suggest group activities or discussion topics, and ensure everyone at the table feels included.`;
  }

  if (user.bio) base += `\nAbout the user: ${user.bio}`;
  if (user.interests?.length) base += `\nUser interests: ${user.interests.join(', ')}`;
  if (user.favoriteCuisines?.length) base += `\nFavorite cuisines: ${user.favoriteCuisines.join(', ')}`;

  return base;
}

async function generateChatResponse(session, preferences, conversationHistory, userMessage) {
  const systemPrompt = buildSystemPrompt(session, preferences);
  const recentHistory = conversationHistory.slice(-20).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  recentHistory.push({ role: 'user', content: userMessage });
  return chatCompletion(systemPrompt, recentHistory, { maxTokens: 600, temperature: 0.8 });
}

async function generateSuggestion(session, preferences, type) {
  const ctx = session.context_snapshot || {};
  const restaurant = ctx.restaurant || {};
  const restaurantName = restaurant.name || 'the restaurant';
  const cuisine = restaurant.cuisine || '';

  const prompts = {
    menu_recommendation: `You're a dining companion at ${restaurantName}${cuisine ? ` (${cuisine})` : ''}. Give a fun, specific menu recommendation or tip about this type of cuisine. Be enthusiastic and specific — mention a dish type, flavor profile, or ordering strategy. 2-3 sentences.`,
    game: `Suggest a quick, fun dining table game or activity for someone at ${restaurantName}. It should be something one person can do or that works with a small group. Give clear instructions in 2-3 sentences. Examples: taste-testing challenge, dish rating game, cuisine trivia.`,
    fun_fact: `Share a fascinating food or restaurant fun fact related to ${cuisine || 'dining'} cuisine or restaurant culture. Make it surprising and conversation-worthy. 2-3 sentences.`,
    topic_suggestion: `Suggest an engaging conversation topic perfect for a dining setting at ${restaurantName}. Make it interesting, open-ended, and easy to get into. Frame it as a question or prompt the person could think about or discuss. 2-3 sentences.`,
  };

  const userPrompt = prompts[type] || prompts.topic_suggestion;
  const personalityTraits = {
    friendly: 'warm and encouraging',
    witty: 'clever and playful',
    intellectual: 'thoughtful and curious',
    chill: 'laid-back and easy-going',
  };
  const tone = personalityTraits[preferences?.ai_personality] || 'warm and encouraging';
  const systemPrompt = `You are TableShare's AI Dining Companion. Your tone is ${tone}. Keep responses concise and engaging.`;

  return chatCompletion(systemPrompt, [{ role: 'user', content: userPrompt }], {
    maxTokens: 300,
    temperature: 0.9,
  });
}

async function generateInitialGreeting(session, preferences) {
  const ctx = session.context_snapshot || {};
  const restaurant = ctx.restaurant || {};
  const restaurantName = restaurant.name || 'the restaurant';
  const cuisine = restaurant.cuisine || '';

  let prompt;
  if (session.session_type === 'solo_companion') {
    prompt = `You just joined someone for a solo dining experience at ${restaurantName}${cuisine ? ` (${cuisine} cuisine)` : ''}. Give a warm, friendly opening message. Welcome them, maybe mention something interesting about the cuisine or restaurant type, and ask what they're in the mood for. 2-3 sentences. Don't introduce yourself by name.`;
  } else if (session.session_type === 'copilot') {
    prompt = `You're the conversation copilot for two people matched to dine together at ${restaurantName}. Give a brief, friendly intro explaining you're here to help with conversation ideas if needed. 2 sentences max. Be unobtrusive.`;
  } else {
    prompt = `You're hosting a shared dining experience at ${restaurantName}. Welcome the group warmly and set the tone for a great meal together. 2-3 sentences.`;
  }

  const systemPrompt = buildSystemPrompt(session, preferences);
  return chatCompletion(systemPrompt, [{ role: 'user', content: prompt }], {
    maxTokens: 200,
    temperature: 0.8,
  });
}

async function generateConversationCoaching(userProfile, matchProfile, restaurant) {
  const prompt = `You are a dining conversation coach. Two people are about to meet for a meal at ${restaurant?.name || 'a restaurant'}${restaurant?.cuisine ? ` (${restaurant.cuisine})` : ''}.

Person asking for advice: ${userProfile.bio || 'No bio'}, interests: ${(userProfile.interests || []).join(', ') || 'not specified'}
Person they're meeting: ${matchProfile.bio || 'No bio'}, interests: ${(matchProfile.interests || []).join(', ') || 'not specified'}

Give 3 personalized conversation tips:
1. A great opening topic based on shared interests or the restaurant
2. A fun question to ask during the meal
3. A way to keep the conversation going if there's a lull

Keep each tip to 1-2 sentences. Be specific and practical.`;

  const response = await chatCompletion(
    'You are a friendly dining conversation coach. Give practical, specific advice. Be warm and encouraging.',
    [{ role: 'user', content: prompt }],
    { maxTokens: 400, temperature: 0.7 }
  );

  return response;
}

async function generateNudge(nudgeType, context) {
  const nudgePrompts = {
    dinner_reminder: `The user has been matched for dinner at ${context.restaurantName || 'a restaurant'} ${context.timeUntil || 'soon'}. Write a brief, friendly reminder nudge (1-2 sentences) that gets them excited about the meal.`,
    try_new_restaurant: `The user frequently dines at ${context.usualType || 'similar'} restaurants. Suggest they try something different. Write a brief nudge (1-2 sentences) suggesting they explore ${context.suggestion || 'a new cuisine'}.`,
    solo_dining_encouragement: `The user hasn't used the solo dining companion in a while. Write a brief, warm nudge (1-2 sentences) encouraging them to try solo dining with the AI companion feature.`,
    conversation_prep: `The user has an upcoming dining match. Write a brief nudge (1-2 sentences) offering to help them prepare conversation topics.`,
    streak_motivation: `The user has a ${context.streakCount || 0}-meal streak going. Write a brief, encouraging nudge (1-2 sentences) motivating them to keep it up.`,
    weekend_suggestion: `It's the weekend. Write a brief nudge (1-2 sentences) suggesting the user explore a new restaurant or invite someone to dine together.`,
  };

  const prompt = nudgePrompts[nudgeType] || nudgePrompts.weekend_suggestion;

  return chatCompletion(
    'You are TableShare\'s friendly notification assistant. Write brief, engaging push notification text. No emojis. Be warm but concise.',
    [{ role: 'user', content: prompt }],
    { maxTokens: 100, temperature: 0.8 }
  );
}

module.exports = {
  generateChatResponse,
  generateSuggestion,
  generateInitialGreeting,
  generateConversationCoaching,
  generateNudge,
};
