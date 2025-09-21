#!/usr/bin/env node

// Standalone debug script for red dot issue
// Run with: node debug-red-dot.js

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load .env file
config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function debugRedDotIssue() {
  console.log('🔍 DEBUGGING CURRENT RED DOT ISSUE');
  console.log('=====================================');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log('❌ Missing environment variables!');
    console.log(`   SUPABASE_URL: ${SUPABASE_URL ? 'Present' : 'Missing'}`);
    console.log(`   SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? 'Present' : 'Missing'}`);
    console.log('\n💡 Make sure your .env file has:');
    console.log('   PUBLIC_SUPABASE_URL=your-url');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=your-service-key');
    return;
  }

  console.log('🔧 Environment loaded:');
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Service Key: ${SUPABASE_SERVICE_KEY ? 'Present' : 'Missing'}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Step 1: Check migration status
    console.log('\n📦 CHECKING MIGRATION STATUS:');
    const { data: migrations } = await supabase
      .from('supabase_migrations')
      .select('name, executed_at')
      .like('name', '%message_status%')
      .order('executed_at', { ascending: false });

    if (migrations && migrations.length > 0) {
      migrations.forEach(m => {
        console.log(`   ✅ ${m.name} - ${m.executed_at}`);
      });
    } else {
      console.log('   ❌ No message_status migrations found!');
    }

    // Step 2: Check message coverage
    console.log('\n📊 CHECKING MESSAGE STATUS COVERAGE:');
    const { data: coverage } = await supabase.rpc('check_message_status_coverage');
    
    if (coverage && coverage.length > 0) {
      const stats = coverage[0];
      console.log(`   Total Messages: ${stats.total_messages}`);
      console.log(`   With Status: ${stats.messages_with_status}`);
      console.log(`   Without Status: ${stats.messages_without_status}`);
      console.log(`   Coverage: ${stats.coverage_percentage}%`);
      
      if (stats.coverage_percentage < 100) {
        console.log(`   ⚠️  ${stats.messages_without_status} messages are missing status entries!`);
        console.log('   💡 This is likely why red dots aren\'t disappearing');
      }
    }

    // Step 3: Get a test user
    console.log('\n👤 FINDING TEST USER:');
    const { data: users } = await supabase
      .from('users')
      .select('id, auth_user_id, username, phone_number')
      .limit(3);

    if (!users || users.length === 0) {
      console.log('   ❌ No users found in system');
      return;
    }

    const user = users[0];
    console.log(`   Using user: ${user.username || user.phone_number || 'N/A'}`);
    console.log(`   Internal ID: ${user.id}`);
    console.log(`   Auth ID: ${user.auth_user_id || 'N/A'}`);

    // Step 4: Check conversations
    console.log('\n💬 CHECKING CONVERSATIONS:');
    const { data: conversations, error: convError } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.auth_user_id });

    if (convError) {
      console.log(`   ❌ Error getting conversations: ${convError.message}`);
      return;
    }

    console.log(`   Found ${conversations?.length || 0} conversations`);

    const unreadConversations = conversations?.filter(c => c.unread_count > 0) || [];
    if (unreadConversations.length > 0) {
      console.log(`   🔴 ${unreadConversations.length} conversations have unread messages:`);
      
      for (const conv of unreadConversations.slice(0, 2)) {
        console.log(`\n      📨 "${conv.conversation_name || 'Unnamed'}" - ${conv.unread_count} unread`);
        
        // Check why these messages are unread
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select(`
            id, created_at, sender_id,
            message_status!left(status, user_id)
          `)
          .eq('conversation_id', conv.conversation_id)
          .neq('sender_id', user.id)
          .limit(3)
          .order('created_at', { ascending: false });

        unreadMessages?.forEach(msg => {
          const userStatus = msg.message_status?.find(s => s.user_id === user.id);
          const status = userStatus?.status || 'NO_STATUS';
          const isUnread = !userStatus || userStatus.status !== 'read';
          console.log(`         • ${msg.id.substring(0,8)}: ${status} ${isUnread ? '(UNREAD)' : '(READ)'}`);
        });
      }
    } else {
      console.log('   ✅ No conversations with unread messages found');
    }

    // Step 5: Provide fix recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (coverage && coverage[0] && coverage[0].coverage_percentage < 100) {
      console.log('   🔧 Run the backfill to fix missing message_status entries:');
      console.log('   SELECT backfill_all_message_status();');
    }
    
    if (unreadConversations.length > 0) {
      console.log('   🔄 Try opening one of the unread conversations in your app');
      console.log('   🔍 Check browser console for errors when opening chats');
      console.log('   🔧 Verify that markMessagesAsRead() is being called');
    }
    
    console.log('\n🛠️  QUICK FIXES:');
    console.log(`
   -- 1. Force run backfill migration:
   SELECT backfill_all_message_status();
   
   -- 2. Check results:
   SELECT * FROM check_message_status_coverage();
   
   -- 3. Emergency: Mark all as read for this user:
   UPDATE message_status 
   SET status = 'read' 
   WHERE user_id = '${user.id}' AND status != 'read';
    `);

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Run the debug
debugRedDotIssue().catch(console.error);