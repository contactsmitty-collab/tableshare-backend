const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const tableMatchmakerController = require('../controllers/tableMatchmakerController');

router.post('/suggest', authenticateToken, tableMatchmakerController.suggestForTwo);

module.exports = router;
