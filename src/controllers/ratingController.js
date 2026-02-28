const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const pointsService = require('../services/pointsService');

// Submit a rating
const submitRating = asyncHandler(async (req, res) => {
  const raterId = req.user.userId;
  const { matchId, ratingValue, wouldDineAgain, feedback } = req.body;

  if (!matchId || !ratingValue) {
    throw new AppError('Match ID and rating value are required', 400);
  }

  if (ratingValue < 1 || ratingValue > 5) {
    throw new AppError('Rating value must be between 1 and 5', 400);
  }

  // Verify user is part of the match
  const matchCheck = await query(
    'SELECT requester_id, receiver_id, status FROM matches WHERE match_id = $1',
    [matchId]
  );

  if (matchCheck.rows.length === 0) {
    throw new AppError('Match not found', 404);
  }

  const match = matchCheck.rows[0];
  if (match.requester_id !== raterId && match.receiver_id !== raterId) {
    throw new AppError('You can only rate matches you are part of', 403);
  }

  // Allow rating accepted or completed matches
  if (match.status !== 'accepted' && match.status !== 'completed') {
    throw new AppError('Can only rate accepted or completed matches', 400);
  }

  // Determine who is being rated
  const ratedUserId = match.requester_id === raterId ? match.receiver_id : match.requester_id;

  // Check if rating already exists
  const existingRating = await query(
    'SELECT rating_id FROM ratings WHERE match_id = $1 AND rater_id = $2',
    [matchId, raterId]
  );

  let result;
  if (existingRating.rows.length > 0) {
    // Update existing rating
    result = await query(
      `UPDATE ratings 
       SET rating_value = $1, would_dine_again = $2, feedback = $3
       WHERE match_id = $4 AND rater_id = $5
       RETURNING rating_id, created_at`,
      [ratingValue, wouldDineAgain || null, feedback || null, matchId, raterId]
    );
  } else {
    // Create new rating
    result = await query(
      `INSERT INTO ratings (match_id, rater_id, rated_user_id, rating_value, would_dine_again, feedback)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING rating_id, created_at`,
      [matchId, raterId, ratedUserId, ratingValue, wouldDineAgain || null, feedback || null]
    );

    // Award points for submitting rating (only for new ratings, not updates)
    await pointsService.awardPoints(raterId, 'rating_submit', null, matchId, 'Submitted rating');
  }

  res.status(201).json({
    message: 'Rating submitted successfully',
    rating: {
      rating_id: result.rows[0].rating_id,
      match_id: matchId,
      rating_value: ratingValue,
      would_dine_again: wouldDineAgain,
      feedback: feedback,
      created_at: result.rows[0].created_at,
    },
  });
});

// Get ratings (optional - for viewing ratings)
const getRatings = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await query(
    `SELECT 
      r.rating_id, r.rating_value, r.would_dine_again, r.feedback, r.created_at,
      m.match_id,
      u.first_name || ' ' || u.last_name as rater_name
     FROM ratings r
     JOIN matches m ON r.match_id = m.match_id
     JOIN users u ON r.rater_id = u.user_id
     WHERE r.rated_user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );

  res.json({
    ratings: result.rows,
  });
});

module.exports = {
  submitRating,
  getRatings,
};
