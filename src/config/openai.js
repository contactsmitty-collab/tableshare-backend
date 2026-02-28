const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Shared chat completion: tries DeepSeek first when DEEPSEEK_API_KEY is set, else OpenAI (real-time generation)
async function chatCompletionForPrompts(systemContent, userContent, maxTokens = 500) {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  if (deepseekKey) {
    try {
      const deepseekClient = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        apiKey: deepseekKey,
      });
      const response = await deepseekClient.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
        temperature: 0.8,
        max_tokens: maxTokens,
      });
      const text = response.choices?.[0]?.message?.content;
      if (text) return text;
    } catch (err) {
      console.warn('DeepSeek conversation starters failed, falling back to OpenAI:', err?.message || err);
    }
  }

  if (openaiKey) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: 0.8,
      max_tokens: maxTokens,
    });
    return response.choices?.[0]?.message?.content || '';
  }

  throw new Error('No AI provider for conversation starters. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
}

// Helper function to generate conversation starters (category-specific, real-time via DeepSeek or OpenAI)
async function generateConversationStarters(category, restaurantName, count = 5) {
  try {
    const categoryPrompts = {
      food: `Generate ${count} engaging conversation starters about food and cuisine for diners at ${restaurantName}. Make them thoughtful, specific to dining experiences, and icebreaker-friendly. Keep each to 1-2 sentences.`,
      lifestyle: `Generate ${count} lifestyle-focused conversation starters that would work well during a dinner at ${restaurantName}. Topics could include work-life balance, hobbies, wellness, travel, or personal growth. Keep each to 1-2 sentences.`,
      dating: `Generate ${count} light, fun, and engaging conversation starters for a date at ${restaurantName}. Make them playful but respectful, helping people get to know each other better. Keep each to 1-2 sentences.`,
      chicago: `Generate ${count} Chicago-specific conversation starters for diners at ${restaurantName}. Could reference local culture, neighborhoods, events, sports, or city life. Keep each to 1-2 sentences.`,
      networking: `Generate ${count} professional networking conversation starters for a business dinner at ${restaurantName}. Make them insightful and career-focused while remaining casual. Keep each to 1-2 sentences.`,
      general: `Generate ${count} versatile conversation starters that work for any dining situation at ${restaurantName}. Make them engaging, open-ended, and universally appealing. Keep each to 1-2 sentences.`
    };

    const userPrompt = categoryPrompts[category] || categoryPrompts.general;
    const systemContent = 'You are a helpful assistant that generates engaging, thoughtful conversation starters for diners at restaurants. Your responses should be natural, inviting, and perfect for breaking the ice. Return only the requested number of starters, one per line; you may use numbers like "1." or "1)" or simple line breaks.';
    const content = await chatCompletionForPrompts(systemContent, userPrompt, 500);

    const prompts = content
      .split(/\d+[.):]\s*|\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 10 && p.length < 200)
      .slice(0, count);

    return prompts.map((text, index) => ({
      prompt_id: `ai-${category}-${Date.now()}-${index}`,
      prompt_text: text,
      category: category,
      is_ai_generated: true
    }));
  } catch (error) {
    console.error('Conversation starters error:', error);
    throw error;
  }
}

// Contextual conversation starters for a specific match (both users' profiles + restaurant)
async function generateContextualConversationStarters(matchContext, count = 5) {
  try {
    const {
      restaurantName = 'the restaurant',
      cuisineType = '',
      myBio = '',
      myConversationPreference = 'flexible',
      otherBio = '',
      otherConversationPreference = 'flexible',
      myDietary = '',
      otherDietary = '',
    } = matchContext;

    const prompt = `You are generating icebreaker conversation starters for two people who matched on TableShare to share a meal at "${restaurantName}"${cuisineType ? ` (${cuisineType})` : ''}.

Person A (the one sending the first message): ${myBio || 'No bio provided.'} Conversation style: ${myConversationPreference}. ${myDietary ? `Dietary: ${myDietary}.` : ''}
Person B (they will receive the message): ${otherBio || 'No bio provided.'} Conversation style: ${otherConversationPreference}. ${otherDietary ? `Dietary: ${otherDietary}.` : ''}

Generate exactly ${count} short, natural conversation starters (1-2 sentences each) that:
- Feel personal and relevant to both people and this restaurant
- Are platonic and appropriate for a first message
- Could reference the venue, cuisine, or something from their profiles
- Are open-ended so the other person can easily respond

Return only the ${count} starters, one per line, without numbers or bullets.`;

    const systemContent = 'You are a helpful assistant that generates engaging, thoughtful conversation starters for diners who matched on a platonic dining app. Keep starters warm, specific, and easy to reply to. Output only the requested number of lines, no numbering.';
    const content = await chatCompletionForPrompts(systemContent, prompt, 500);
    const prompts = content
      .split(/\n+/)
      .map(p => p.replace(/^\d+[.):]\s*/, '').trim())
      .filter(p => p.length > 10 && p.length < 200)
      .slice(0, count);

    return prompts.map((text, index) => ({
      prompt_id: `ai-contextual-${Date.now()}-${index}`,
      prompt_text: text,
      category: 'contextual',
      is_ai_generated: true,
    }));
  } catch (error) {
    console.error('OpenAI contextual conversation starters error:', error);
    throw error;
  }
}

// Helper function to generate a bio. Tries DeepSeek first when DEEPSEEK_API_KEY is set, then falls back to OpenAI.
async function generateBio(userData) {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  const useDeepSeekFirst = Boolean(deepseekKey);
  const useOpenAI = Boolean(openaiKey);

  if (!useDeepSeekFirst && !useOpenAI) {
    const err = new Error('No AI provider for bio. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
    err.code = 'OPENAI_NOT_CONFIGURED';
    throw err;
  }

  const rawInterests = userData.interests;
  const rawCuisines = userData.favoriteCuisines;
  const interests = Array.isArray(rawInterests) ? rawInterests : (rawInterests ? [rawInterests] : []);
  const favoriteCuisines = Array.isArray(rawCuisines) ? rawCuisines : (rawCuisines ? [rawCuisines] : []);
  const occupation = String(userData.occupation || '');
  const diningStyle = String(userData.diningStyle || '');
  const aboutMe = String(userData.aboutMe || '');

  const prompt = `Generate a warm, engaging, and authentic bio for a TableShare user with the following details:
- Interests: ${interests.join(', ') || 'various interests'}
- Occupation: ${occupation || 'professional'}
- Favorite Cuisines: ${favoriteCuisines.join(', ') || 'various cuisines'}
- Dining Style: ${diningStyle || 'enjoys good food and company'}
- Additional Info: ${aboutMe || ''}

Write a bio that's 2-3 sentences, personable, and highlights what makes them interesting as a dining companion. Keep it friendly and inviting.`;

  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant that writes authentic, engaging dating/dining app bios. Your bios should be warm, genuine, and highlight what makes someone an interesting person to share a meal with.'
    },
    { role: 'user', content: prompt }
  ];
  const opts = { messages, temperature: 0.7, max_tokens: 200 };

  // 1) Try DeepSeek first when configured
  if (useDeepSeekFirst) {
    try {
      const deepseekClient = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        apiKey: deepseekKey,
      });
      const response = await deepseekClient.chat.completions.create({
        ...opts,
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      });
      const content = response.choices?.[0]?.message?.content;
      const bio = (typeof content === 'string' ? content : '').trim();
      if (bio) return bio;
    } catch (err) {
      const isRateLimit = err?.status === 429 || (err?.message && /rate limit/i.test(err.message));
      if (isRateLimit) console.warn('Bio: DeepSeek rate limited, falling back to OpenAI');
      else console.warn('Bio: DeepSeek error', err?.message || err);
    }
  }

  // 2) Fall back to OpenAI
  if (useOpenAI) {
    try {
      const response = await openai.chat.completions.create({
        ...opts,
        model: 'gpt-4o-mini',
      });
      const content = response.choices?.[0]?.message?.content;
      const bio = (typeof content === 'string' ? content : '').trim();
      if (bio) return bio;
    } catch (err) {
      console.error('OpenAI bio generation error:', err);
      throw err;
    }
  }

  throw new Error('Bio generation failed (no response from AI). Please try again.');
}

// Helper function to generate restaurant recommendations
async function generateRecommendations(userProfile, restaurants, count = 5) {
  try {
    const { interests = [], favoriteCuisines = [], diningHistory = [], preferences = {} } = userProfile;

    const restaurantContext = restaurants.map(r => ({
      name: r.name,
      cuisine: r.cuisine,
      vibe: r.vibe || 'casual',
      priceRange: r.price_range || '$$',
      highlights: r.highlights || []
    }));

    const prompt = `Based on this user's profile:
- Interests: ${interests.join(', ')}
- Favorite Cuisines: ${favoriteCuisines.join(', ')}
- Dining History: ${diningHistory.slice(0, 5).join(', ')}
- Preferences: ${JSON.stringify(preferences)}

Recommend the top ${count} restaurants from this list that would be the best match:
${JSON.stringify(restaurantContext, null, 2)}

Return only the names of the restaurants in order of best match, one per line.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a restaurant recommendation expert. You understand dining preferences, cuisine types, and can match people with restaurants they will love.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 300
    });

    const recommendations = response.choices[0].message.content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, count);

    return recommendations;
  } catch (error) {
    console.error('OpenAI recommendations error:', error);
    throw error;
  }
}

// Table Matchmaker: suggest restaurants that work for BOTH diners. AI returns only names from the list; we resolve to full restaurant data in the controller.
// Returns array of { restaurant_id, name, reason } where name is from our list (controller will fill full details from DB).
async function generateMatchmakerSuggestions(diner1Profile, diner2Profile, restaurants, count = 3) {
  const restaurantList = restaurants.map(r => ({ name: r.name, cuisine_type: r.cuisine_type, price_range: r.price_range, city: r.city }));
  const namesOnly = restaurantList.map(r => r.name).filter(Boolean);

  const prompt = `You are TableShare's Table Matchmaker. Choose exactly ${count} restaurants from the names below that work for BOTH diners.

Diner 1: ${JSON.stringify(diner1Profile)}
Diner 2: ${JSON.stringify(diner2Profile)}

Restaurant names (choose only from this exact list, copy names exactly):
${JSON.stringify(namesOnly)}

Return a JSON array of exactly ${count} items. Each item: { "name": "<exact name from the list above>", "reason": "1-2 sentences why it works for both" }.
Output only the JSON array, no markdown. Example: [{"name":"Girl & the Goat","reason":"..."},{"name":"Lou Malnati's","reason":"..."}]`;

  const messages = [
    { role: 'system', content: 'You output only a JSON array. Each object has "name" (exact string from the provided list only) and "reason". Never use cuisine types or generic words as names.' },
    { role: 'user', content: prompt },
  ];
  const opts = { messages, temperature: 0.3, max_tokens: 500 };

  const deepseekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  let raw = null;

  if (deepseekKey) {
    try {
      const deepseekClient = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        apiKey: deepseekKey,
      });
      const response = await deepseekClient.chat.completions.create({
        ...opts,
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      });
      raw = (response.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
      console.warn('Matchmaker DeepSeek error:', err?.message || err);
    }
  }

  if (!raw && openaiKey) {
    try {
      const response = await openai.chat.completions.create({ ...opts, model: 'gpt-4o-mini' });
      raw = (response.choices?.[0]?.message?.content || '').trim();
    } catch (error) {
      console.error('OpenAI matchmaker error:', error);
      throw error;
    }
  }

  if (!raw) throw new Error('No AI provider for matchmaker. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');

  const jsonMatch = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(jsonMatch);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.slice(0, count).filter((x) => x && typeof x.name === 'string');
}

module.exports = {
  openai,
  generateConversationStarters,
  generateContextualConversationStarters,
  generateBio,
  generateRecommendations,
  generateMatchmakerSuggestions,
};
