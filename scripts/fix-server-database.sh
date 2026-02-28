#!/bin/bash
# Script to fix database connection on production server
# Run this on the server: bash scripts/fix-server-database.sh

set -e

echo "🔧 Fixing TableShare Database Connection"
echo "=========================================="
echo ""

cd /opt/tableshare-backend || exit 1

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found. Creating it..."
    cat > .env.local << 'EOF'
DATABASE_URL=postgresql://tableshare_user:tableshare_secure_pass_2026@localhost:5432/tableshare_prod
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=3000
NODE_ENV=production
EOF
    echo "✅ Created .env.local"
else
    echo "✅ .env.local exists"
fi

# Verify DATABASE_URL is correct
echo ""
echo "📋 Current .env.local DATABASE_URL:"
grep DATABASE_URL .env.local | sed 's/:[^:@]*@/:****@/'

# Test database connection
echo ""
echo "🔍 Testing database connection..."
node -e "
require('dotenv').config({ path: '.env.local' });
const { pool } = require('./src/config/database');
pool.query('SELECT NOW() as time, version() as version')
  .then(result => {
    console.log('✅ Database connection successful!');
    console.log('   Time:', result.rows[0].time);
    console.log('   PostgreSQL:', result.rows[0].version.split(',')[0]);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Database connection failed!');
    console.error('   Error:', error.message);
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   1. Check PostgreSQL is running: sudo systemctl status postgresql');
    console.error('   2. Verify user exists: sudo -u postgres psql -c \"\\du\"');
    console.error('   3. Test manually: PGPASSWORD=tableshare_secure_pass_2026 psql -h localhost -U tableshare_user -d tableshare_prod -c \"SELECT 1\"');
    process.exit(1);
  });
"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database connection is working!"
    echo ""
    echo "🔄 Restarting PM2..."
    pm2 restart tableshare-api
    echo ""
    echo "✅ Done! Backend should now be able to connect to the database."
else
    echo ""
    echo "❌ Database connection test failed. Please fix the issues above."
    exit 1
fi
