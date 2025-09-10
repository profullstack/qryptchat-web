/**
 * Database Diagnostic Script
 * Connects to production Supabase database and runs diagnostic queries
 * to investigate the multi-user encryption issue
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get environment variables
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  console.error('Required: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const CONVERSATION_ID = '00672035-e2ed-464a-ae42-7060fe23587b';

async function runDiagnostics() {
  console.log('🔍 [DATABASE DIAGNOSTIC] Starting investigation...\n');

  try {
    // Query 1: Check all users
    console.log('==================== QUERY 1: Check All Users ====================');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, display_name, auth_user_id')
      .order('created_at');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log('👥 Users found:', users.length);
    users.forEach(user => {
      console.log(`  - ${user.username} (${user.display_name})`);
      console.log(`    ID: ${user.id}`);
      console.log(`    Auth ID: ${user.auth_user_id}\n`);
    });

    // Query 2: Get messages with recipients
    console.log('==================== QUERY 2: Message Recipients Analysis ====================');
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, created_at, sender_id')
      .eq('conversation_id', CONVERSATION_ID)
      .order('created_at');

    if (messagesError) {
      console.error('❌ Error fetching messages:', messagesError);
      return;
    }

    console.log(`📨 Messages found: ${messages.length}`);

    // Get message recipients for all messages
    const messageIds = messages.map(m => m.id);
    const { data: recipients, error: recipientsError } = await supabase
      .from('message_recipients')
      .select('message_id, recipient_user_id, encrypted_content')
      .in('message_id', messageIds);

    if (recipientsError) {
      console.error('❌ Error fetching recipients:', recipientsError);
      return;
    }

    console.log(`📊 Total message recipients: ${recipients.length}`);

    // Count recipients per user
    const recipientCounts = {};
    recipients.forEach(recipient => {
      const userId = recipient.recipient_user_id;
      recipientCounts[userId] = (recipientCounts[userId] || 0) + 1;
    });

    console.log('📊 Recipients per user:');
    Object.entries(recipientCounts).forEach(([userId, count]) => {
      const user = users.find(u => u.id === userId);
      console.log(`  - ${user?.username || 'Unknown'} (${userId}): ${count} messages`);
    });

    // Query 4: Check content uniqueness (CRITICAL)
    console.log('\n==================== QUERY 4: Check Content Uniqueness (CRITICAL) ====================');
    
    const totalRecipients = recipients.length;
    const uniqueContents = new Set(recipients.map(r => r.encrypted_content)).size;

    console.log(`📊 Total message recipients: ${totalRecipients}`);
    console.log(`📊 Unique encrypted contents: ${uniqueContents}`);
    
    if (uniqueContents < totalRecipients) {
      console.log('🚨 BUG DETECTED: Duplicate encrypted content found!');
      console.log('🚨 This explains why User B cannot decrypt messages!');
      
      // Find duplicates
      const contentCounts = {};
      recipients.forEach(recipient => {
        const content = recipient.encrypted_content;
        contentCounts[content] = (contentCounts[content] || 0) + 1;
      });
      
      const duplicates = Object.entries(contentCounts).filter(([_, count]) => count > 1);
      console.log(`🚨 Found ${duplicates.length} duplicate encrypted contents:`);
      duplicates.forEach(([content, count]) => {
        console.log(`  - Content (${content.substring(0, 50)}...): ${count} copies`);
      });
    } else {
      console.log('✅ All encrypted content is unique - this is not the issue');
    }

    // Query 5: Sample content comparison
    console.log('\n==================== QUERY 5: Sample Content Comparison ====================');
    
    // Get latest 3 messages and their recipients
    const latestMessages = messages.slice(-3);
    console.log('📋 Sample of latest 3 messages with encrypted content:');
    
    for (const message of latestMessages) {
      const messageRecipients = recipients.filter(r => r.message_id === message.id);
      console.log(`\n📨 Message ${message.id} (${message.created_at}):`);
      
      messageRecipients.forEach(recipient => {
        const user = users.find(u => u.id === recipient.recipient_user_id);
        const username = user?.username || 'Unknown';
        const contentPreview = recipient.encrypted_content?.substring(0, 100) || 'No content';
        const contentLength = recipient.encrypted_content?.length || 0;
        
        console.log(`  - ${username}: ${contentLength} chars, "${contentPreview}..."`);
      });
    }

    console.log('\n🎯 [DIAGNOSTIC COMPLETE]');
    console.log('If Query 4 shows duplicate content, we found the bug!');
    console.log('If all content is unique, the issue is elsewhere in the encryption/decryption flow.');

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run diagnostics
runDiagnostics();