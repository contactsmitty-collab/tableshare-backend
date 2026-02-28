/**
 * Photo moderation: check if an image is appropriate before storing.
 * Uses OpenAI vision to classify; rejects if explicit, violence, or hate content.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
const OpenAI = require('openai');

async function moderateImage(buffer, mimeType = 'image/jpeg') {
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) {
    return { allowed: true };
  }

  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  const openai = new OpenAI({ apiKey: openaiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content: 'You are a content moderator. Look at the image and answer only YES or NO: Does this image contain explicit sexual content, graphic violence, gore, or hate symbols? Answer NO for normal selfies, profile photos, or food/restaurant photos.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUri },
            },
          ],
        },
      ],
    });

    const text = (response.choices[0]?.message?.content || '').trim().toUpperCase();
    const allowed = !text.startsWith('YES');
    return {
      allowed,
      reason: allowed ? undefined : 'Image did not meet guidelines',
    };
  } catch (err) {
    console.error('Photo moderation error:', err?.message || err);
    return { allowed: true };
  }
}

module.exports = { moderateImage };
