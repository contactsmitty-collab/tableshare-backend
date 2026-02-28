/**
 * Rule-based compatibility score (0-100) for two diners.
 * Used to sort nearby diners and matches by fit.
 * Inputs: conversation_preference, dietary_tags (array or JSON string), optional interests/cuisine later.
 */
function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeCompatibilityScore(myProfile, otherProfile) {
  let score = 50; // base

  const myConv = (myProfile.conversation_preference || '').toLowerCase();
  const otherConv = (otherProfile.conversation_preference || '').toLowerCase();
  if (myConv && otherConv && myConv === otherConv) {
    score += 20; // same conversation style
  }

  const myDietary = parseTags(myProfile.dietary_tags);
  const otherDietary = parseTags(otherProfile.dietary_tags);
  if (myDietary.length > 0 && otherDietary.length > 0) {
    const overlap = myDietary.filter(t => otherDietary.includes(t));
    if (overlap.length > 0) {
      score += Math.min(25, 10 + overlap.length * 5); // dietary overlap
    }
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

module.exports = { computeCompatibilityScore, parseTags };
