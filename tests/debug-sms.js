/**
 * @fileoverview Debug script for SMS notification system
 * Tests the database functions and SMS service directly
 */

import { createClient } from '@supabase/supabase-js';

// Create Supabase client
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugSMSSystem() {
  console.log('🔍 Starting SMS notification system debug...');
  
  try {
    // Test 1: Check if database functions exist
    console.log('\n📋 Test 1: Checking database functions...');
    
    // Test 2: Check database schema
    console.log('\n📋 Test 2: Checking database schema...');
    try {
      const { data, error } = await supabase.rpc('get_inactive_participants', { conversation_uuid: 'test' });
      if (error) {
        console.error('❌ get_inactive_participants function error:', error);
      } else {
        console.log('✅ get_inactive_participants function accessible');
      }
    } catch (err) {
      console.error('❌ get_inactive_participants function error:', err);
    }
    
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, phone_number, sms_notifications_enabled, last_active_at, is_online')
      .limit(5);
    
    if (usersError) {
      console.error('❌ Users table error:', usersError);
    } else {
      console.log('✅ Users table accessible');
      console.log('📊 Sample users:', users);
    }
    
    // Test 3: Check SMS notifications table
    const { data: smsTable, error: smsError } = await supabase
      .from('sms_notifications')
      .select('*')
      .limit(1);
    
    if (smsError) {
      console.error('❌ SMS notifications table error:', smsError);
    } else {
      console.log('✅ SMS notifications table accessible');
    }
    
    // Test 4: Test activity tracking
    console.log('\n📋 Test 4: Testing activity tracking...');
    if (users && users.length > 0) {
      const testUser = users[0];
      try {
        const { error: activityError } = await supabase.rpc('update_user_activity', { user_uuid: testUser.id });
        if (activityError) {
          console.error('❌ update_user_activity function error:', activityError);
        } else {
          console.log('✅ update_user_activity function works');
        }
      } catch (err) {
        console.error('❌ update_user_activity function error:', err);
      }
    }
    
    // Test 5: Create test scenario
    console.log('\n📋 Test 5: Creating test scenario...');
    
    // First, let's see what conversations exist
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, type')
      .limit(5);
    
    if (convError) {
      console.error('❌ Conversations table error:', convError);
    } else {
      console.log('✅ Found conversations:', conversations);
      
      if (conversations && conversations.length > 0) {
        const testConversation = conversations[0];
        console.log(`🧪 Testing with conversation: ${testConversation.id}`);
        
        // Test get_inactive_participants with real conversation
        try {
          const { data: inactiveUsers, error: inactiveError } = await supabase.rpc('get_inactive_participants', { 
            conversation_uuid: testConversation.id 
          });
          
          if (inactiveError) {
            console.error('❌ get_inactive_participants error:', inactiveError);
          } else {
            console.log('✅ get_inactive_participants works:', {
              count: inactiveUsers?.length || 0,
              users: inactiveUsers
            });
          }
        } catch (err) {
          console.error('❌ get_inactive_participants error:', err);
        }
      }
    }
    
  } catch (error) {
    console.error('💥 Debug script error:', error);
  }
}

// Run the debug
debugSMSSystem().then(() => {
  console.log('\n🏁 Debug complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});