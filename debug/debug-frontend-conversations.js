#!/usr/bin/env node

// Debug what the frontend sees vs database reality
// Run with: node debug-frontend-conversations.js

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function debugFrontendConversations() {
  console.log('🕵️ FRONTEND vs DATABASE DEEP DIVE');
  console.log('==================================');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Get user 
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('username', 'aueightyfive')
      .single();

    console.log(`👤 User: ${user.username}`);
    console.log(`   Internal ID: ${user.id}`);
    console.log(`   Auth ID: ${user.auth_user_id}`);

    // Check all conversations in the system
    console.log('\n📊 ALL CONVERSATIONS IN SYSTEM:');
    const { data: allConversations } = await supabase
      .from('conversations')
      .select('id, type, name, created_by, created_at')
      .limit(10);

    console.log(`   Total conversations in system: ${allConversations?.length || 0}`);
    if (allConversations && allConversations.length > 0) {
      allConversations.forEach(c => {
        console.log(`     • ${c.id.substring(0,8)} - ${c.type} - "${c.name || 'Unnamed'}" - Created by: ${c.created_by?.substring(0,8) || 'N/A'}`);
      });
    }

    // Check conversation participants
    console.log('\n👥 CONVERSATION PARTICIPANTS:');
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id, user_id, role, joined_at, left_at,
        conversations(id, type, name),
        users(username)
      `)
      .limit(10);

    console.log(`   Total participants: ${allParticipants?.length || 0}`);
    if (allParticipants && allParticipants.length > 0) {
      allParticipants.forEach(p => {
        const isOurUser = p.user_id === user.id;
        const leftStatus = p.left_at ? '(LEFT)' : '(ACTIVE)';
        console.log(`     • Conv ${p.conversation_id.substring(0,8)} - User: ${p.users?.username || 'N/A'} ${isOurUser ? '👈 THIS IS YOU' : ''} ${leftStatus}`);
      });
    }

    // Check specifically for this user's participations
    console.log(`\n🔍 USER '${user.username}' PARTICIPATIONS:`);
    const { data: userParticipations } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id, role, joined_at, left_at,
        conversations(id, type, name, created_at)
      `)
      .eq('user_id', user.id);

    console.log(`   User participates in: ${userParticipations?.length || 0} conversations`);
    if (userParticipations && userParticipations.length > 0) {
      userParticipations.forEach(p => {
        const leftStatus = p.left_at ? ' (LEFT)' : '';
        console.log(`     • ${p.conversations?.type} - "${p.conversations?.name || 'Unnamed'}" - ${p.role}${leftStatus}`);
      });
    }

    // Test different versions of the function
    console.log('\n🧪 TESTING FUNCTION VARIATIONS:');
    
    // Test 1: get_user_conversations_enhanced with auth_user_id  
    const { data: test1, error: err1 } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.auth_user_id });
    console.log(`   Enhanced function (auth_user_id): ${test1?.length || 0} conversations ${err1 ? `ERROR: ${err1.message}` : ''}`);

    // Test 2: get_user_conversations_enhanced with internal user_id
    const { data: test2, error: err2 } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.id });
    console.log(`   Enhanced function (internal_id): ${test2?.length || 0} conversations ${err2 ? `ERROR: ${err2.message}` : ''}`);

    // Test 3: get_user_conversations wrapper
    const { data: test3, error: err3 } = await supabase
      .rpc('get_user_conversations', { user_uuid: user.auth_user_id });
    console.log(`   Wrapper function (auth_user_id): ${test3?.length || 0} conversations ${err3 ? `ERROR: ${err3.message}` : ''}`);

    // Test 4: get_user_conversations wrapper with internal ID
    const { data: test4, error: err4 } = await supabase
      .rpc('get_user_conversations', { user_uuid: user.id });
    console.log(`   Wrapper function (internal_id): ${test4?.length || 0} conversations ${err4 ? `ERROR: ${err4.message}` : ''}`);

    // Check if there are conversations but the user is marked as left
    console.log('\n🚪 CHECKING FOR "LEFT" CONVERSATIONS:');
    const { data: leftConversations } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id, left_at,
        conversations(name, type)
      `)
      .eq('user_id', user.id)
      .not('left_at', 'is', null);

    if (leftConversations && leftConversations.length > 0) {
      console.log(`   Found ${leftConversations.length} conversations user has left:`);
      leftConversations.forEach(p => {
        console.log(`     • "${p.conversations?.name || 'Unnamed'}" - Left: ${p.left_at}`);
      });
      console.log(`   💡 These might be showing as cached in frontend!`);
    } else {
      console.log(`   No left conversations found`);
    }

    console.log('\n🔍 FRONTEND INVESTIGATION NEEDED:');
    console.log(`   Since database shows 0 conversations but frontend shows red dots:`);
    console.log(`   1. Check browser DevTools → Network tab`);
    console.log(`   2. See what API endpoint frontend actually calls`);
    console.log(`   3. Check if frontend uses local storage for conversations`);
    console.log(`   4. Verify frontend is hitting the right database`);
    
    console.log('\n🛠️  EMERGENCY FRONTEND DEBUG:');
    console.log(`   Open browser console and run:`);
    console.log(`   
   // Check what API returns
   fetch('/api/chat/conversations', { credentials: 'include' })
     .then(r => r.json())
     .then(data => console.log('Frontend API result:', data));
   
   // Check local storage
   console.log('LocalStorage:', localStorage);
   console.log('SessionStorage:', sessionStorage);
   
   // Check if there's a service worker caching
   navigator.serviceWorker?.getRegistrations()
     .then(regs => console.log('Service workers:', regs));
   `);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugFrontendConversations().catch(console.error);