const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { events } = require('../utils/events');
const { getJwtSecret } = require('../config/env');

const RESET_TOKEN_EXPIRY_HOURS = 1;
const DEV_RETURN_RESET_TOKEN = process.env.DEV_RETURN_RESET_TOKEN === 'true';

const signup = asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, dateOfBirth } = req.body;

  const existingUser = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, date_of_birth)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id, email, first_name, last_name`,
    [email, passwordHash, firstName, lastName, dateOfBirth]
  );

  const user = result.rows[0];
  const token = jwt.sign(
    { userId: user.user_id, email: user.email },
    process.env.JWT_SECRET || 'dev-secret-key',
    { expiresIn: '7d' }
  );

  res.status(201).json({
    message: 'User created successfully',
    user: {
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    token,
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  console.log('Login attempt for:', email);

  const result = await query(
    'SELECT user_id, email, password_hash, first_name, last_name, role, is_admin, restaurant_id FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    console.log('User not found:', email);
    throw new AppError('Invalid credentials', 401);
  }

  const user = result.rows[0];
  console.log('User found, comparing password. Hash length:', user.password_hash?.length);
  
  const validPassword = await bcrypt.compare(password, user.password_hash);
  console.log('Password valid:', validPassword);
  
  if (!validPassword) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = jwt.sign(
    { userId: user.user_id, email: user.email },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

  events.login(user.user_id, true);
  res.json({
    message: 'Login successful',
    user: {
      userId: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role || 'user',
      is_admin: user.is_admin || false,
      restaurant_id: user.restaurant_id || null,
    },
    token,
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT user_id, email, first_name, last_name, date_of_birth FROM users WHERE user_id = $1',
    [req.user.userId]
  );

  res.json({ user: result.rows[0] });
});

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Creates a one-time reset token. In production you would email the link; in dev you can return the token.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    throw new AppError('Email is required', 400);
  }

  const userResult = await query(
    'SELECT user_id, email FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );

  // Always return same message to avoid email enumeration
  const message = 'If an account exists with that email, you will receive a password reset link.';

  if (userResult.rows.length === 0) {
    return res.json({ message });
  }

  const user = userResult.rows[0];
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.user_id, tokenHash, expiresAt]
  );

  // TODO: Send email with reset link, e.g. https://yourapp.com/reset-password?token=plainToken
  // For dev/testing, optionally return the token so portal can build the reset link
  const payload = { message };
  if (DEV_RETURN_RESET_TOKEN) {
    payload.resetToken = plainToken;
    payload.expiresAt = expiresAt.toISOString();
  }

  res.json(payload);
});

/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 * Consumes the token and sets the user's new password.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || typeof token !== 'string') {
    throw new AppError('Reset token is required', 400);
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  const tokenResult = await query(
    `SELECT token_id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );

  if (tokenResult.rows.length === 0) {
    throw new AppError('Invalid or expired reset link. Please request a new one.', 400);
  }

  const { token_id, user_id } = tokenResult.rows[0];
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [passwordHash, user_id]);
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = $1', [token_id]);

  res.json({ message: 'Password has been reset. You can now sign in.' });
});

module.exports = { signup, login, getProfile, forgotPassword, resetPassword };
