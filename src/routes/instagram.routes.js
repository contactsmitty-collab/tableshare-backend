const express = require('express');
const router = express.Router();
const axios = require('axios');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'https://tableshare.pixelcheese.com/auth/instagram/callback';

if (!INSTAGRAM_CLIENT_ID || !INSTAGRAM_CLIENT_SECRET) {
  console.warn('Instagram OAuth disabled: set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET in .env');
}

// Get Instagram OAuth link URL (new Instagram API with Instagram Login)
router.get('/link-url', authenticateToken, asyncHandler(async (req, res) => {
  const scope = 'instagram_business_basic';
  const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&scope=${scope}&response_type=code`;
  
  res.json({
    url: authUrl,
  });
}));

// Exchange authorization code for access token (server-side for security)
router.post('/exchange-code', authenticateToken, asyncHandler(async (req, res) => {
  if (!INSTAGRAM_CLIENT_ID || !INSTAGRAM_CLIENT_SECRET) {
    throw new AppError('Instagram linking is not configured', 503);
  }
  const { code } = req.body;
  const userId = req.user.userId;

  if (!code) {
    throw new AppError('Authorization code is required', 400);
  }

  try {
    // Exchange code for short-lived access token
    const tokenResponse = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      new URLSearchParams({
        client_id: INSTAGRAM_CLIENT_ID,
        client_secret: INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code: code,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token: shortLivedToken, user_id: instagramUserId } = tokenResponse.data;

    // Exchange short-lived token for long-lived token (60 days)
    const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: INSTAGRAM_CLIENT_SECRET,
        access_token: shortLivedToken,
      },
    });

    const { access_token: longLivedToken, expires_in } = longLivedResponse.data;

    // Get user's Instagram profile (new API uses /me endpoint)
    const profileResponse = await axios.get('https://graph.instagram.com/v21.0/me', {
      params: {
        fields: 'user_id,username',
        access_token: longLivedToken,
      },
    });

    const { username: instagramHandle } = profileResponse.data;

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

    // Update user's Instagram info
    await query(
      `UPDATE users 
       SET instagram_handle = $1, instagram_is_verified = false, instagram_access_token = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [instagramHandle, longLivedToken, userId]
    );

    // Store OAuth tokens
    await query(
      `INSERT INTO instagram_oauth (user_id, instagram_user_id, access_token, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET instagram_user_id = $2, access_token = $3, expires_at = $4, updated_at = NOW()`,
      [userId, instagramUserId, longLivedToken, expiresAt]
    );

    res.json({
      message: 'Instagram account linked successfully',
      instagram_handle: instagramHandle,
      instagram_is_verified: false,
    });
  } catch (error) {
    console.error('Instagram OAuth error:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error_message || 'Failed to link Instagram account',
      400
    );
  }
}));

// Link Instagram account (legacy endpoint - accepts pre-exchanged token)
router.post('/link', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { accessToken, instagramUserId, instagramHandle } = req.body;

  if (!accessToken || !instagramUserId) {
    throw new AppError('Access token and Instagram user ID are required', 400);
  }

  // Update user's Instagram info
  await query(
    `UPDATE users 
     SET instagram_handle = $1, instagram_is_verified = false, instagram_access_token = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [instagramHandle || null, accessToken, userId]
  );

  // Store OAuth tokens
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 60); // 60 days default

  await query(
    `INSERT INTO instagram_oauth (user_id, instagram_user_id, access_token, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) 
     DO UPDATE SET instagram_user_id = $2, access_token = $3, expires_at = $4, updated_at = NOW()`,
    [userId, instagramUserId, accessToken, expiresAt]
  );

  res.json({
    message: 'Instagram account linked successfully',
    instagram_handle: instagramHandle,
    instagram_is_verified: false,
  });
}));

// Unlink Instagram account
router.delete('/unlink', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  await query(
    `UPDATE users 
     SET instagram_handle = NULL, instagram_is_verified = false, instagram_access_token = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  await query(`DELETE FROM instagram_oauth WHERE user_id = $1`, [userId]);

  res.json({ message: 'Instagram account unlinked successfully' });
}));

module.exports = router;
