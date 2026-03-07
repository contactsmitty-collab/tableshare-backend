const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { AppError } = require('./errorHandler');
const { getJwtSecret } = require('../config/env');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(new AppError('Access token required', 401));
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (error) {
    return next(new AppError('Invalid token', 401));
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT role, is_admin FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('User not found', 404));
    }

    const user = result.rows[0];
    if (user.role !== 'admin' && !user.is_admin) {
      return next(new AppError('Admin access required', 403));
    }

    next();
  } catch (error) {
    return next(new AppError('Authorization check failed', 500));
  }
};

/** Allow admin OR restaurant manager (only for their own restaurant when id in params) */
const requireAdminOrRestaurantManager = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT role, is_admin, restaurant_id FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('User not found', 404));
    }

    const user = result.rows[0];
    if (user.role === 'admin' || user.is_admin) {
      return next();
    }
    if (user.role === 'restaurant' && user.restaurant_id) {
      const reqRestaurantId = (req.params.id || req.params.restaurantId || '').toString().trim();
      const userRestaurantId = String(user.restaurant_id || '').trim();
      if (reqRestaurantId && userRestaurantId && reqRestaurantId === userRestaurantId) {
        return next();
      }
    }
    return next(new AppError('Access denied', 403));
  } catch (error) {
    return next(new AppError('Authorization check failed', 500));
  }
};

/** Allow admin OR restaurant manager (only for their own restaurant_id in query) */
const requireAdminOrRestaurant = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT role, is_admin, restaurant_id FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('User not found', 404));
    }

    const user = result.rows[0];
    if (user.role === 'admin' || user.is_admin) {
      return next();
    }
    if (user.role === 'restaurant' && user.restaurant_id) {
      const reqRestaurantId = (req.query.restaurant_id || '').toString().trim();
      const userRestaurantId = String(user.restaurant_id || '').trim();
      if (reqRestaurantId && userRestaurantId && reqRestaurantId === userRestaurantId) {
        return next();
      }
    }
    return next(new AppError('Admin access required', 403));
  } catch (error) {
    return next(new AppError('Authorization check failed', 500));
  }
};

module.exports = { authenticateToken, requireAdmin, requireAdminOrRestaurant, requireAdminOrRestaurantManager };
