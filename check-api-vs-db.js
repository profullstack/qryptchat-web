#!/usr/bin/env node

// Check if frontend API returns different data than database function
// Run with: node check-api-vs-db.js

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
// Using built-in fetch (Node.js 18+)

// Load .env file
config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function checkAPIvsDatabaseDifference() {
  console.log('🔍 CHECKING API vs DATABASE DIFFERENCE');
  console.log('======================================');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Get user data
    const { data: user } = await supabase
      .from('users')
      .select('id, auth_user_id, username')
      .eq('username', 'aueightyfive')
      .single();

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`👤 User: ${user.username}`);
    console.log(`   Internal ID: ${user.id}`);
    console.log(`   Auth ID: ${user.auth_user_id}`);

    // Method 1: Direct database function call (what we tested above)
    console.log('\n🗃️  DATABASE FUNCTION RESULT:');
    const { data: dbConversations, error: dbError } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.auth_user_id });

    if (dbError) {
      console.log(`   ❌ Database error: ${dbError.message}`);
    } else {
      console.log(`   Found ${dbConversations?.length || 0} conversations`);
      const dbUnread = dbConversations?.filter(c => c.unread_count > 0) || [];
      console.log(`   Unread conversations: ${dbUnread.length}`);
      dbUnread.forEach(c => {
        console.log(`     • ${c.conversation_name}: ${c.unread_count} unread`);
      });
    }

    // Method 2: Try the API endpoint that the frontend actually uses
    console.log('\n🌐 FRONTEND API RESULT:');
    console.log('   (This might fail due to authentication, but let\'s try...)');
    
    // We can't easily test the API endpoint without proper auth headers
    // So let's check if there's a different function being called
    
    // Method 3: Check if there's a different function or parameter format
    console.log('\n🔍 TRYING DIFFERENT FUNCTION PARAMETERS:');
    
    // Try with internal user ID instead of auth_user_id
    const { data: altConversations, error: altError } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.id });

    if (altError) {
      console.log(`   ❌ Alt function error: ${altError.message}`);
    } else {
      console.log(`   Alt function result: ${altConversations?.length || 0} conversations`);
      const altUnread = altConversations?.filter(c => c.unread_count > 0) || [];
      console.log(`   Alt unread conversations: ${altUnread.length}`);
      altUnread.forEach(c => {
        console.log(`     • ${c.conversation_name}: ${c.unread_count} unread`);
      });
    }

    // Method 4: Check the wrapper function
    console.log('\n🔄 CHECKING WRAPPER FUNCTION:');
    const { data: wrapperConversations, error: wrapperError } = await supabase
      .rpc('get_user_conversations', { user_uuid: user.auth_user_id });

    if (wrapperError) {
      console.log(`   ❌ Wrapper function error: ${wrapperError.message}`);
    } else {
      console.log(`   Wrapper function result: ${wrapperConversations?.length || 0} conversations`);
      const wrapperUnread = wrapperConversations?.filter(c => c.unread_count > 0) || [];
      console.log(`   Wrapper unread conversations: ${wrapperUnread.length}`);
      wrapperUnread.forEach(c => {
        console.log(`     • ${c.name}: ${c.unread_count} unread`);
      });
    }

    // Step 5: Check raw conversation data to see what's happening
    console.log('\n📊 RAW CONVERSATION CHECK:');
    const { data: rawConversations } = await supabase
      .from('conversations')
      .select(`
        id, type, name,
        conversation_participants!inner(user_id)
      `)
      .eq('conversation_participants.user_id', user.id)
      .limit(5);

    console.log(`   Raw conversations found: ${rawConversations?.length || 0}`);

    if (rawConversations && rawConversations.length > 0) {
      console.log(`\n❓ MYSTERY SOLVED:`);
      console.log(`   Database function returns 0 conversations`);
      console.log(`   But raw query finds ${rawConversations.length} conversations`);
      console.log(`   This suggests the function parameter or logic has an issue!`);

      // Check each conversation manually
      for (const conv of rawConversations.slice(0, 2)) {
        console.log(`\n   📨 Conversation ${conv.id.substring(0,8)}:`);
        
        // Manual unread count calculation
        const { data: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user.id)
          .or(`message_status.is.null,message_status.status.neq.read`, {
            referencedTable: 'message_status',
            foreignTable: 'message_status'
          });

        console.log(`      Manual unread count: ${unreadCount || 0}`);
      }
    }

    console.log('\n🎯 CONCLUSION:');
    if (dbConversations?.length === 0 && rawConversations?.length > 0) {
      console.log('   🐛 The get_user_conversations_enhanced function has a bug!');
      console.log('   💡 Check if it\'s using the right parameter format or user ID type');
    } else if (dbConversations?.length === 0) {
      console.log('   ✅ Database shows no unread messages');
      console.log('   🔄 The red dot is likely frontend cache - try hard refresh');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAPIvsDatabaseDifference().catch(console.error);