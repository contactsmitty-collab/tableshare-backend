const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin, requireAdminOrRestaurant, requireAdminOrRestaurantManager } = require('../middleware/auth');

// Check-ins and ratings: admin OR restaurant manager (for their own restaurant_id)
router.get('/checkins', authenticateToken, requireAdminOrRestaurant, adminController.getAllCheckIns);
router.get('/ratings', authenticateToken, requireAdminOrRestaurant, adminController.getAllRatings);

// Admin-only routes
router.get('/stats/trends', authenticateToken, requireAdmin, adminController.getStatsTrends);
router.get('/stats', authenticateToken, requireAdmin, adminController.getPlatformStats);
router.get('/users', authenticateToken, requireAdmin, adminController.getAllUsers);
router.post('/users', authenticateToken, requireAdmin, adminController.createUser);
router.put('/users/:id', authenticateToken, requireAdmin, adminController.updateUser);
router.delete('/users/:id', authenticateToken, requireAdmin, adminController.deleteUser);
router.get('/restaurants', authenticateToken, requireAdmin, adminController.getAllRestaurants);
router.post('/restaurants', authenticateToken, requireAdmin, adminController.createRestaurant);
router.put('/restaurants/:id', authenticateToken, requireAdminOrRestaurantManager, adminController.updateRestaurant);
router.delete('/restaurants/:id', authenticateToken, requireAdmin, adminController.deleteRestaurant);
router.get('/restaurants/:id/promotions', authenticateToken, requireAdminOrRestaurantManager, adminController.getPromotions);
router.post('/restaurants/:id/promotions', authenticateToken, requireAdminOrRestaurantManager, adminController.createPromotion);
router.patch('/restaurants/:id/promotions/:promoId', authenticateToken, requireAdminOrRestaurantManager, adminController.updatePromotion);
router.delete('/restaurants/:id/promotions/:promoId', authenticateToken, requireAdminOrRestaurantManager, adminController.deletePromotion);
router.get('/reports', authenticateToken, requireAdmin, adminController.getAllReports);
router.patch('/reports/:id', authenticateToken, requireAdmin, adminController.updateReport);
router.get('/blocks', authenticateToken, requireAdmin, adminController.getAllBlocks);
router.get('/restaurants/:id/waitlist', authenticateToken, requireAdminOrRestaurantManager, adminController.getRestaurantWaitlist);

module.exports = router;
