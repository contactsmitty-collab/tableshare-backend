const express = require('express');
const router = express.Router();
const promptController = require('../controllers/promptController');
const { authenticateToken } = require('../middleware/auth');

// Generate AI-powered prompts
router.get('/ai/generate', authenticateToken, promptController.generateAIPrompts);

// Contextual conversation starters for a match (match_id required)
router.get('/contextual', authenticateToken, promptController.getContextualPrompts);

// Get prompts (supports ai=true query param)
router.get('/', authenticateToken, promptController.getPrompts);

// Get specific prompt
router.get('/:promptId', authenticateToken, promptController.getPromptById);

// Track prompt usage
router.post('/usage', authenticateToken, promptController.trackPromptUsage);

module.exports = router;
