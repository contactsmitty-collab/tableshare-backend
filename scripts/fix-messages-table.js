// Fix messages table schema - add message_text column if missing
require('dotenv').config({ path: '.env.local' });
const { query } = require('../src/config/database');

async function fixMessagesTable() {
  try {
    console.log('🔍 Checking messages table schema...');
    
    // Check if message_text column exists
    const checkColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages' 
      AND column_name = 'message_text'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('⚠️  message_text column missing. Adding it...');
      
      // Add the column
      await query(`
        ALTER TABLE messages 
        ADD COLUMN message_text TEXT NOT NULL DEFAULT ''
      `);
      
      // Update existing rows if any (though there shouldn't be any without message_text)
      await query(`
        UPDATE messages 
        SET message_text = '' 
        WHERE message_text IS NULL
      `);
      
      console.log('✅ Added message_text column to messages table');
    } else {
      console.log('✅ message_text column already exists');
    }
    
    // Verify the full schema
    const schema = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Current messages table schema:');
    schema.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    console.log('\n✅ Messages table schema fixed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing messages table:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixMessagesTable();
