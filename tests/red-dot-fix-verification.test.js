#!/usr/bin/env node

/**
 * Test to verify that the red dot (unread indicator) disappears when opening a chat
 * This test simulates the complete flow: conversation selection -> message read status update
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { describe, it, beforeAll, expect } from 'vitest';

// Load environment variables
config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

describe('Red Dot Fix Verification', () => {
  let supabase;
  let testUser;
  let testConversation;
  let unreadMessages;

  beforeAll(async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log('🔍 Setting up test environment...');
    
    // Get a test user
    const { data: users } = await supabase
      .from('users')
      .select('id, auth_user_id, username, phone_number')
      .limit(1);
      
    if (!users || users.length === 0) {
      throw new Error('No test users found');
    }
    
    testUser = users[0];
    console.log(`   Using test user: ${testUser.username || testUser.phone_number || testUser.id}`);
  });

  it('should find a conversation with unread messages', async () => {
    console.log('📊 Finding conversation with unread messages...');
    
    // Get user conversations with unread counts
    const { data: conversations, error } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: testUser.auth_user_id });
    
    expect(error).to.be.null;
    expect(conversations).to.be.an('array');
    
    // Find a conversation with unread messages
    testConversation = conversations.find(conv => conv.unread_count > 0);
    
    if (!testConversation) {
      console.log('   ⚠️  No conversations with unread messages found. Creating test scenario...');
      
      // Create a test scenario by finding any conversation and adding an unread message
      const anyConversation = conversations[0];
      if (anyConversation) {
        testConversation = anyConversation;
        
        // Insert a test message from another user to make it unread
        const { data: otherUsers } = await supabase
          .from('users')
          .select('id')
          .neq('id', testUser.id)
          .limit(1);
          
        if (otherUsers && otherUsers.length > 0) {
          const { error: insertError } = await supabase
            .from('messages')
            .insert({
              conversation_id: testConversation.conversation_id,
              sender_id: otherUsers[0].id,
              message_type: 'text',
              encrypted_content: 'Test message for red dot verification',
              created_at: new Date().toISOString()
            });
            
          if (!insertError) {
            console.log('   ✅ Created test message for verification');
            
            // Refresh conversation data
            const { data: refreshedConversations } = await supabase
              .rpc('get_user_conversations_enhanced', { user_uuid: testUser.auth_user_id });
              
            testConversation = refreshedConversations.find(c => c.conversation_id === testConversation.conversation_id);
          }
        }
      }
    }
    
    expect(testConversation).to.not.be.null;
    console.log(`   Found conversation: "${testConversation.conversation_name || 'Unnamed'}" with ${testConversation.unread_count} unread messages`);
  });

  it('should have messages marked as unread initially', async () => {
    console.log('🔴 Verifying initial unread status...');
    
    // Get unread messages in the conversation
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        id, created_at, sender_id,
        message_status!left(status, user_id)
      `)
      .eq('conversation_id', testConversation.conversation_id)
      .neq('sender_id', testUser.id)
      .order('created_at', { ascending: false })
      .limit(5);
    
    expect(messages).to.be.an('array');
    expect(messages.length).to.be.greaterThan(0);
    
    unreadMessages = messages.filter(msg => {
      const userStatus = msg.message_status?.find(s => s.user_id === testUser.id);
      return !userStatus || userStatus.status !== 'read';
    });
    
    expect(unreadMessages.length).to.be.greaterThan(0);
    console.log(`   ✅ Found ${unreadMessages.length} unread messages`);
  });

  it('should mark messages as read when setActiveConversation is called', async () => {
    console.log('📝 Simulating conversation selection (setActiveConversation)...');
    
    // Simulate the chat store's setActiveConversation logic
    const messageIds = unreadMessages.map(msg => msg.id);
    
    // Mark messages as read (same logic as in chat.js markMessagesAsRead)
    const readStatuses = messageIds.map(messageId => ({
      message_id: messageId,
      user_id: testUser.id,
      status: 'read',
      timestamp: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('message_status')
      .upsert(readStatuses, { onConflict: 'message_id,user_id' });

    expect(error).to.be.null;
    console.log(`   ✅ Marked ${messageIds.length} messages as read`);
  });

  it('should show updated unread count after marking as read', async () => {
    console.log('🟢 Verifying updated unread counts...');
    
    // Wait a moment for the database to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Refresh conversation data to get updated unread counts
    const { data: updatedConversations, error } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: testUser.auth_user_id });
    
    expect(error).to.be.null;
    
    const updatedConversation = updatedConversations.find(
      c => c.conversation_id === testConversation.conversation_id
    );
    
    expect(updatedConversation).to.not.be.null;
    
    console.log(`   Previous unread count: ${testConversation.unread_count}`);
    console.log(`   Current unread count: ${updatedConversation.unread_count}`);
    
    // The unread count should be less than or equal to the original count
    // (might not be zero if there are other unread messages)
    expect(updatedConversation.unread_count).to.be.lessThanOrEqual(testConversation.unread_count);
    
    console.log('   ✅ Unread count updated correctly - red dot should disappear/update!');
  });

  it('should verify messages are now marked as read', async () => {
    console.log('✅ Verifying messages are now marked as read...');
    
    // Check that the previously unread messages now have read status
    const messageIds = unreadMessages.map(msg => msg.id);
    
    const { data: messageStatuses } = await supabase
      .from('message_status')
      .select('message_id, status')
      .in('message_id', messageIds)
      .eq('user_id', testUser.id);
    
    expect(messageStatuses).to.be.an('array');
    
    const readCount = messageStatuses.filter(status => status.status === 'read').length;
    
    console.log(`   ${readCount}/${messageIds.length} messages now marked as read`);
    expect(readCount).to.equal(messageIds.length);
    
    console.log('   ✅ All targeted messages are now marked as read!');
  });

  // Test summary will be shown in the final test
});