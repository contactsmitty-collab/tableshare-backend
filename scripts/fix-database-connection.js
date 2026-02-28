// Script to test and fix database connection on server
require('dotenv').config({ path: '.env.local' });
const { pool } = require('../src/config/database');

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  console.log('Current DATABASE_URL:', process.env.DATABASE_URL ? 
    process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'NOT SET');
  
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log('   Current time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(',')[0]);
    
    // Test query to users table
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log('   Users in database:', userCount.rows[0].count);
    
    // Test query to restaurants table
    const restaurantCount = await pool.query('SELECT COUNT(*) as count FROM restaurants');
    console.log('   Restaurants in database:', restaurantCount.rows[0].count);
    
    console.log('\n✅ All database tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', error.message);
    console.error('\n💡 To fix:');
    console.error('1. Check that .env.local has:');
    console.error('   DATABASE_URL=postgresql://tableshare_user:tableshare_secure_pass_2026@localhost:5432/tableshare_prod');
    console.error('2. Verify PostgreSQL is running: sudo systemctl status postgresql');
    console.error('3. Test connection manually:');
    console.error('   PGPASSWORD=tableshare_secure_pass_2026 psql -h localhost -U tableshare_user -d tableshare_prod -c "SELECT 1"');
    process.exit(1);
  }
}

testConnection();
