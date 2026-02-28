#!/usr/bin/env node
/**
 * Set accepts_reservations = true for all restaurants (or only where currently false).
 * Run from backend root: node scripts/enable-reservations-for-all.js
 *
 * If DATABASE_URL has no password (or PGPASSWORD is not set), you will be prompted for
 * user and password. On Mac, the DB user is often your Mac username (e.g. christophersmith).
 *
 * Optional: pass "dry" to only print what would be updated:
 *   node scripts/enable-reservations-for-all.js dry
 */

const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');
const parseConnectionString = require('pg-connection-string').parse;

const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });

const osUser = process.env.USER || process.env.USERNAME || 'postgres';

function ask(question, defaultAnswer) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultAnswer != null ? `${question} [${defaultAnswer}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const v = (answer && answer.trim()) || '';
      resolve(v || defaultAnswer || '');
    });
  });
}

async function getConnectionConfig() {
  let connectionString = process.env.DATABASE_URL || null;
  if (!connectionString) {
    connectionString = `postgresql://${osUser}@localhost:5432/tableshare_dev`;
  } else {
    // If URL uses "postgres" user, switch to OS user (Mac often has no postgres role)
    connectionString = connectionString.replace(/postgresql:\/\/postgres(:[^@]*)?@/, `postgresql://${osUser}@`);
  }

  const parsed = parseConnectionString(connectionString);
  let user = parsed.user || osUser;
  let password =
    (typeof parsed.password === 'string' ? parsed.password : null) ||
    (typeof process.env.PGPASSWORD === 'string' ? process.env.PGPASSWORD : null) ||
    '';

  if (!password) {
    user = await ask('Database user', user) || user;
    password = await ask('Database password (or Enter for no password)', '');
  }

  return {
    host: parsed.host || 'localhost',
    port: parsed.port || 5432,
    user,
    database: parsed.database || parsed.user || 'tableshare_dev',
    password,
    ssl: parsed.ssl,
  };
}

async function main() {
  const dryRun = process.argv.includes('dry');
  const config = await getConnectionConfig();
  const pool = new Pool(config);

  const query = (text, params) => pool.query(text, params);

  try {
    const countResult = await query(
      "SELECT COUNT(*) AS n FROM restaurants WHERE accepts_reservations = false OR accepts_reservations IS NULL"
    );
    const toUpdate = parseInt(countResult.rows[0]?.n || 0, 10);

    if (toUpdate === 0) {
      console.log('No restaurants need updating (all already accept reservations).');
      await pool.end();
      process.exit(0);
      return;
    }

    if (dryRun) {
      console.log(`Would set accepts_reservations = true for ${toUpdate} restaurant(s). Run without "dry" to apply.`);
      await pool.end();
      process.exit(0);
      return;
    }

    const result = await query(
      `UPDATE restaurants SET accepts_reservations = true
       WHERE accepts_reservations = false OR accepts_reservations IS NULL
       RETURNING restaurant_id, name`
    );
    console.log(`Updated ${result.rowCount} restaurant(s) to accept reservations.`);
    result.rows.forEach((r) => console.log(`  - ${r.name || r.restaurant_id}`));
    await pool.end();
    process.exit(0);
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
