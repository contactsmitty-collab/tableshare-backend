const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/auth');

router.get('/:matchId', authenticateToken, messageController.getMessages);
router.post('/', authenticateToken, messageController.sendMessage);

module.exports = router;
