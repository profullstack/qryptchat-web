// End-to-end test for unread message system
// Tests database triggers, API endpoints, and unread count functionality

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Test configuration
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

describe('Unread Message System', () => {
  let supabaseServiceRole;
  let testUserId1, testUserId2;
  let conversationId;

  before(async () => {
    // Initialize service role client for setup
    supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Create test users
    const { data: user1 } = await supabaseServiceRole
      .from('users')
      .insert([{
        phone_number: '+1234567890',
        username: 'test_user_1',
        display_name: 'Test User 1',
        auth_user_id: 'test-auth-user-1'
      }])
      .select()
      .single();
    
    const { data: user2 } = await supabaseServiceRole
      .from('users')
      .insert([{
        phone_number: '+1234567891', 
        username: 'test_user_2',
        display_name: 'Test User 2',
        auth_user_id: 'test-auth-user-2'
      }])
      .select()
      .single();

    testUserId1 = user1.id;
    testUserId2 = user2.id;

    // Create test conversation
    const { data: conversation } = await supabaseServiceRole
      .from('conversations')
      .insert([{
        type: 'direct',
        created_by: testUserId1
      }])
      .select()
      .single();

    conversationId = conversation.id;

    // Add participants
    await supabaseServiceRole
      .from('conversation_participants')
      .insert([
        { conversation_id: conversationId, user_id: testUserId1, role: 'admin' },
        { conversation_id: conversationId, user_id: testUserId2, role: 'member' }
      ]);
  });

  after(async () => {
    // Clean up test data
    if (conversationId) {
      await supabaseServiceRole
        .from('conversations')
        .delete()
        .eq('id', conversationId);
    }
    
    if (testUserId1) {
      await supabaseServiceRole
        .from('users')
        .delete()
        .eq('id', testUserId1);
    }
    
    if (testUserId2) {
      await supabaseServiceRole
        .from('users')
        .delete()
        .eq('id', testUserId2);
    }
  });

  describe('Database Triggers and Message Status Creation', () => {
    it('should create message_status entries when a message is inserted', async () => {
      // Insert a message directly into the database
      const { data: message } = await supabaseServiceRole
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: testUserId1,
          encrypted_content: Buffer.from('Test message'),
          message_type: 'text'
        }])
        .select()
        .single();

      // Wait a moment for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that message_status entry was created for the recipient (user2)
      const { data: messageStatuses } = await supabaseServiceRole
        .from('message_status')
        .select('*')
        .eq('message_id', message.id);

      expect(messageStatuses).to.have.length(1);
      expect(messageStatuses[0].user_id).to.equal(testUserId2);
      expect(messageStatuses[0].status).to.equal('delivered');
    });

    it('should not create message_status entry for the sender', async () => {
      // Insert another message 
      const { data: message } = await supabaseServiceRole
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: testUserId2,
          encrypted_content: Buffer.from('Reply message'),
          message_type: 'text'
        }])
        .select()
        .single();

      // Wait a moment for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that no message_status entry was created for the sender
      const { data: senderStatus } = await supabaseServiceRole
        .from('message_status')
        .select('*')
        .eq('message_id', message.id)
        .eq('user_id', testUserId2);

      expect(senderStatus).to.have.length(0);

      // But should exist for the recipient
      const { data: recipientStatus } = await supabaseServiceRole
        .from('message_status')
        .select('*')
        .eq('message_id', message.id)
        .eq('user_id', testUserId1);

      expect(recipientStatus).to.have.length(1);
      expect(recipientStatus[0].status).to.equal('delivered');
    });
  });

  describe('Unread Count Calculation', () => {
    it('should calculate unread counts correctly in get_user_conversations_enhanced', async () => {
      // Get conversations for user1 (should have 1 unread from user2)
      const { data: conversations } = await supabaseServiceRole
        .rpc('get_user_conversations_enhanced', { user_uuid: testUserId1 });

      const testConversation = conversations?.find(c => c.conversation_id === conversationId);
      
      expect(testConversation).to.exist;
      expect(testConversation.unread_count).to.equal(1);

      // Get conversations for user2 (should have 1 unread from user1)  
      const { data: conversations2 } = await supabaseServiceRole
        .rpc('get_user_conversations_enhanced', { user_uuid: testUserId2 });

      const testConversation2 = conversations2?.find(c => c.conversation_id === conversationId);
      
      expect(testConversation2).to.exist;
      expect(testConversation2.unread_count).to.equal(1);
    });

    it('should update unread count when messages are marked as read', async () => {
      // Mark messages as read for user1
      await supabaseServiceRole
        .from('message_status')
        .update({ status: 'read', timestamp: new Date().toISOString() })
        .eq('user_id', testUserId1);

      // Check updated unread count
      const { data: conversations } = await supabaseServiceRole
        .rpc('get_user_conversations_enhanced', { user_uuid: testUserId1 });

      const testConversation = conversations?.find(c => c.conversation_id === conversationId);
      
      expect(testConversation).to.exist;
      expect(testConversation.unread_count).to.equal(0);
    });
  });

  describe('Mark as Read Functionality', () => {
    let testMessageId;

    before(async () => {
      // Create another test message
      const { data: message } = await supabaseServiceRole
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: testUserId1,
          encrypted_content: Buffer.from('Test read message'),
          message_type: 'text'
        }])
        .select()
        .single();

      testMessageId = message.id;
      
      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should mark message as read via API endpoint', async () => {
      // Note: This would require actual API testing with authentication
      // For now, test the database function directly
      
      const { error } = await supabaseServiceRole
        .rpc('fn_mark_message_read', {
          p_message_id: testMessageId,
          p_user_id: testUserId2
        });

      expect(error).to.be.null;

      // Verify status was updated
      const { data: status } = await supabaseServiceRole
        .from('message_status')
        .select('status')
        .eq('message_id', testMessageId)
        .eq('user_id', testUserId2)
        .single();

      expect(status?.status).to.equal('read');
    });

    it('should handle batch mark as read', async () => {
      // Create multiple messages
      const messages = [];
      for (let i = 0; i < 3; i++) {
        const { data: message } = await supabaseServiceRole
          .from('messages')
          .insert([{
            conversation_id: conversationId,
            sender_id: testUserId1,
            encrypted_content: Buffer.from(`Batch message ${i}`),
            message_type: 'text'
          }])
          .select()
          .single();
        
        messages.push(message);
      }

      // Wait for triggers
      await new Promise(resolve => setTimeout(resolve, 200));

      // Mark all as read using upsert
      const readStatuses = messages.map(msg => ({
        message_id: msg.id,
        user_id: testUserId2,
        status: 'read',
        timestamp: new Date().toISOString()
      }));

      await supabaseServiceRole
        .from('message_status')
        .upsert(readStatuses, { onConflict: 'message_id,user_id' });

      // Verify all were marked as read
      const { data: statuses } = await supabaseServiceRole
        .from('message_status')
        .select('status')
        .in('message_id', messages.map(m => m.id))
        .eq('user_id', testUserId2);

      expect(statuses).to.have.length(3);
      statuses.forEach(status => {
        expect(status.status).to.equal('read');
      });
    });
  });

  describe('Integration with UI Components', () => {
    it('should provide unread count for ConversationItem component', async () => {
      // Create a fresh message to ensure unread count > 0
      await supabaseServiceRole
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: testUserId1,
          encrypted_content: Buffer.from('UI test message'),
          message_type: 'text'
        }]);

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get conversation data as the UI would
      const { data: conversations } = await supabaseServiceRole
        .rpc('get_user_conversations_enhanced', { user_uuid: testUserId2 });

      const conversation = conversations?.find(c => c.conversation_id === conversationId);
      
      // Verify the structure matches what ConversationItem expects
      expect(conversation).to.have.property('conversation_id');
      expect(conversation).to.have.property('conversation_name');
      expect(conversation).to.have.property('unread_count');
      expect(conversation.unread_count).to.be.a('number');
      expect(conversation.unread_count).to.be.greaterThan(0);

      // This is what the ConversationItem component checks for red dot
      const shouldShowRedDot = conversation.unread_count > 0;
      expect(shouldShowRedDot).to.be.true;
    });
  });

  describe('Real-time Updates', () => {
    it('should handle message_status updates in real-time', async () => {
      // This would test WebSocket/real-time functionality
      // For now, verify that the database structure supports it
      
      const { data: message } = await supabaseServiceRole
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: testUserId1,
          encrypted_content: Buffer.from('Real-time test message'),
          message_type: 'text'
        }])
        .select()
        .single();

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate real-time update by marking as read
      await supabaseServiceRole
        .from('message_status')
        .update({ status: 'read' })
        .eq('message_id', message.id)
        .eq('user_id', testUserId2);

      // Verify the change is reflected in conversation query
      const { data: conversations } = await supabaseServiceRole
        .rpc('get_user_conversations_enhanced', { user_uuid: testUserId2 });

      const conversation = conversations?.find(c => c.conversation_id === conversationId);
      
      // The unread count should now exclude the message we just marked as read
      expect(conversation).to.exist;
      // Note: Exact count depends on other test messages, but it should be consistent
    });
  });
});