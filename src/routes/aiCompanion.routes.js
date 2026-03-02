const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ai = require('../controllers/aiCompanionController');

router.use(authenticateToken);

router.post('/sessions', ai.startSession);
router.get('/sessions/active', ai.getActiveSession);
router.put('/sessions/:sessionId/end', ai.endSession);
router.post('/sessions/:sessionId/messages', ai.sendMessage);
router.get('/sessions/:sessionId/messages', ai.getMessages);
router.get('/suggestions', ai.getSuggestions);
router.put('/suggestions/:messageId/used', ai.markSuggestionUsed);
router.get('/preferences', ai.getPreferences);
router.put('/preferences', ai.updatePreferences);
router.post('/coaching', ai.getCoaching);
router.get('/nudges', ai.getNudges);
router.put('/nudges/:nudgeId/dismiss', ai.dismissNudge);
router.put('/nudges/:nudgeId/acted', ai.actOnNudge);

module.exports = router;
