// Script to create dining_groups and group_members tables
// Run this if migrations fail due to permissions

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const { query } = require('../src/config/database');

async function createGroupsTables() {
  try {
    console.log('🔄 Creating dining_groups and group_members tables...\n');

    // Create dining_groups table
    await query(`
      CREATE TABLE IF NOT EXISTS dining_groups (
        group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        group_name VARCHAR(255) NOT NULL,
        created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created dining_groups table');

    // Create indexes for dining_groups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_dining_groups_created_by ON dining_groups(created_by);
      CREATE INDEX IF NOT EXISTS idx_dining_groups_restaurant_id ON dining_groups(restaurant_id);
    `);
    console.log('✅ Created indexes for dining_groups');

    // Create group_members table
    await query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id UUID NOT NULL REFERENCES dining_groups(group_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      );
    `);
    console.log('✅ Created group_members table');

    // Create indexes for group_members
    await query(`
      CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
    `);
    console.log('✅ Created indexes for group_members');

    // Add foreign key constraint to check_ins if it doesn't exist
    try {
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_check_ins_group_id'
          ) THEN
            ALTER TABLE check_ins 
            ADD CONSTRAINT fk_check_ins_group_id 
            FOREIGN KEY (group_id) REFERENCES dining_groups(group_id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      console.log('✅ Added foreign key constraint to check_ins');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log('⚠️  Foreign key constraint already exists (skipping)');
      } else {
        throw error;
      }
    }

    console.log('\n✅ All tables created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    process.exit(1);
  }
}

createGroupsTables();
