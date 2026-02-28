/**
 * Message moderation: check if message text is appropriate (platonic, no harassment/sexual/hate).
 * Uses OpenAI Moderation API. Returns { allowed: true } or { allowed: false }.
 */
const OpenAI = require('openai');

async function moderateMessageText(text) {
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) {
    return { allowed: true };
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  try {
    const response = await openai.moderations.create({
      input: text,
      model: 'text-moderation-latest',
    });
    const result = response.results && response.results[0];
    const allowed = !result || !result.flagged;
    return { allowed };
  } catch (err) {
    console.error('Message moderation error:', err?.message || err);
    return { allowed: true };
  }
}

module.exports = { moderateMessageText };
