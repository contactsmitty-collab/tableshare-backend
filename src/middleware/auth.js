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

module.exports = { authenticateToken, requireAdmin };
