const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, feedController.getFeed);

module.exports = router;
