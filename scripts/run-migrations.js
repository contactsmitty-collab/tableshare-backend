const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { pool } = require('../src/config/database');

async function runMigrations() {
  console.log('🔄 Running migrations...\n');
  
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Run in order: 001, 002, 003, etc.
  
  console.log(`Found ${files.length} migration files\n`);
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(`Running ${file}...`);
      await pool.query(sql);
      console.log(`✓ ${file} completed\n`);
    } catch (error) {
      // If table already exists, that's okay for IF NOT EXISTS
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log(`⚠ ${file} - tables/columns may already exist (skipping)\n`);
      } else if (error.message.includes('invalid input syntax for type uuid')) {
        // 007 on some servers has typo (r instead of b/e); 026 re-inserts with valid UUIDs
        console.log(`⚠ ${file} - skipped (invalid UUID; 026 will seed Chicago data)\n`);
      } else {
        console.error(`✗ ${file} failed:`, error.message);
        throw error;
      }
    }
  }
  
  console.log('✅ All migrations completed!\n');
  await pool.end();
  process.exit(0);
}

runMigrations().catch(error => {
  console.error('Migration error:', error);
  process.exit(1);
});
