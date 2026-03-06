const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Read-only admin/manager data - require admin or restaurant manager (authorization in controller or requireAdmin)
router.get('/checkins', authenticateToken, requireAdmin, adminController.getAllCheckIns);
router.get('/ratings', authenticateToken, requireAdmin, adminController.getAllRatings);

// Admin-only routes
router.get('/stats', authenticateToken, requireAdmin, adminController.getPlatformStats);
router.get('/users', authenticateToken, requireAdmin, adminController.getAllUsers);
router.post('/users', authenticateToken, requireAdmin, adminController.createUser);
router.put('/users/:id', authenticateToken, requireAdmin, adminController.updateUser);
router.delete('/users/:id', authenticateToken, requireAdmin, adminController.deleteUser);
router.get('/restaurants', authenticateToken, requireAdmin, adminController.getAllRestaurants);
router.post('/restaurants', authenticateToken, requireAdmin, adminController.createRestaurant);
router.put('/restaurants/:id', authenticateToken, requireAdmin, adminController.updateRestaurant);
router.delete('/restaurants/:id', authenticateToken, requireAdmin, adminController.deleteRestaurant);

module.exports = router;
