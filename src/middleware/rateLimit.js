const rateLimit = require('express-rate-limit');

// Auth: limit login/signup per IP to reduce brute force and spam signups
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // trust proxy set in server.js; disable all validation to avoid ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
});

// Reservation create: limit bookings per IP to reduce abuse
const reservationCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many reservation attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Bio generation: limit per user to avoid burning OpenAI quota and hitting their 429
const bioGenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many bio generation attempts. Please try again in a moment.' },
  keyGenerator: (req) => req.user?.userId || req.ip || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Public/unauthenticated endpoints (e.g. dining-lists signal) - limit per IP to prevent enumeration
const publicSignalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Feedback: limit submissions per user to prevent spam
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many feedback submissions. Please try again later.' },
  keyGenerator: (req) => req.user?.userId || req.ip || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

module.exports = { authLimiter, reservationCreateLimiter, bioGenerateLimiter, publicSignalLimiter, feedbackLimiter };
