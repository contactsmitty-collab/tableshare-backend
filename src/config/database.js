const { Pool } = require('pg');
const parseConnectionString = require('pg-connection-string').parse;

// Build connection string: use DATABASE_URL if set, else default to local DB
let connectionString = process.env.DATABASE_URL || null;
if (!connectionString) {
  const defaultUser = process.env.USER || process.env.USERNAME || 'postgres';
  connectionString = `postgresql://${defaultUser}@localhost:5432/tableshare_dev`;
} else if (/postgresql:\/\/postgres@/.test(connectionString)) {
  // URL is postgres@ with no password — macOS often has no "postgres" role, so use OS user for trust/peer auth
  const localUser = process.env.USER || process.env.USERNAME || 'postgres';
  connectionString = connectionString.replace(/^postgresql:\/\/postgres@/, `postgresql://${localUser}@`);
}

// Parse into options. pg's config treats password '' as falsy and replaces it with null, which
// makes SCRAM throw "client password must be a string". Passing a function ensures the client
// always receives a string when it calls the getter.
const parsed = parseConnectionString(connectionString);
const passwordValue =
  (typeof parsed.password === 'string' ? parsed.password : null) ||
  (typeof process.env.PGPASSWORD === 'string' ? process.env.PGPASSWORD : null) ||
  '';
const pool = new Pool({
  host: parsed.host,
  port: parsed.port,
  user: parsed.user,
  database: parsed.database || parsed.user,
  password: () => Promise.resolve(passwordValue),
  ssl: parsed.ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10) || 30000;

const query = async (text, params) => {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS);
    });
    const res = await Promise.race([pool.query(text, params), timeoutPromise]);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

module.exports = { query, pool };
