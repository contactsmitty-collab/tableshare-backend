/**
 * Recommendation Routes
 * AI-Powered Restaurant Recommendations API
 */

const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route GET /api/v1/recommendations/for-you
 * @desc Get personalized "For You" recommendations
 * @query limit, offset, latitude, longitude
 * @access Private
 */
router.get('/for-you', recommendationController.getForYouRecommendations);

/**
 * @route GET /api/v1/recommendations/similar-to/:restaurantId
 * @desc Get restaurants similar to a specific restaurant
 * @access Private
 */
router.get('/similar-to/:restaurantId', recommendationController.getSimilarTo);

/**
 * @route GET /api/v1/recommendations/trending
 * @desc Get trending restaurants
 * @query city, cuisine, limit, near_me
 * @access Private
 */
router.get('/trending', recommendationController.getTrending);

/**
 * @route GET /api/v1/recommendations/explore
 * @desc Get exploration recommendations (new cuisines, outside comfort zone)
 * @query limit, adventurousness
 * @access Private
 */
router.get('/explore', recommendationController.getExplore);

/**
 * @route GET /api/v1/recommendations/friends-like
 * @desc Get restaurants liked by user's friends/matches
 * @query limit
 * @access Private
 */
router.get('/friends-like', recommendationController.getFriendsLike);

/**
 * @route POST /api/v1/recommendations/feedback/:restaurantId
 * @desc Record user feedback on a recommendation
 * @body action (clicked, dismissed, visited), recommendationType
 * @access Private
 */
router.post('/feedback/:restaurantId', recommendationController.recordRecommendationFeedback);

/**
 * @route GET /api/v1/recommendations/taste-profile
 * @desc Get user's taste profile
 * @access Private
 */
router.get('/taste-profile', recommendationController.getMyTasteProfile);

/**
 * @route POST /api/v1/recommendations/taste-profile
 * @desc Update user's taste profile preferences
 * @access Private
 */
router.post('/taste-profile', recommendationController.updateTasteProfile);

/**
 * @route GET /api/v1/recommendations/insights
 * @desc Get recommendation insights and stats
 * @access Private
 */
router.get('/insights', recommendationController.getRecommendationInsights);

/**
 * @route POST /api/v1/recommendations/refresh-all
 * @desc Admin: Refresh recommendations for all users
 * @access Private (Admin only)
 */
router.post('/refresh-all', recommendationController.refreshAllRecommendations);

module.exports = router;
