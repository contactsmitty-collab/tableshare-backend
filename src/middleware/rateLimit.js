const rateLimit = require('express-rate-limit');

// Auth: limit login/signup per IP to reduce brute force and spam signups
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Reservation create: limit bookings per IP to reduce abuse
const reservationCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many reservation attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Bio generation: limit per user to avoid burning OpenAI quota and hitting their 429
const bioGenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many bio generation attempts. Please try again in a moment.' },
  keyGenerator: (req) => req.user?.userId || req.ip || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, reservationCreateLimiter, bioGenerateLimiter };
