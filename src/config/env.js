/**
 * Centralized env checks for security.
 * In production, fail fast if required secrets are missing.
 */

const isProduction = process.env.NODE_ENV === 'production';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (isProduction && (!secret || secret === 'dev-secret-key')) {
    throw new Error('JWT_SECRET must be set in production. Do not use default or empty value.');
  }
  return secret || 'dev-secret-key';
}

module.exports = { isProduction, getJwtSecret };
