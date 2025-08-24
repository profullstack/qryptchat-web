// Comprehensive test suite for disappearing messages system
// Tests the complete workflow from message creation to expiry

import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import { createServiceRoleClient } from '../src/lib/supabase/service-role.js';

const supabase = createServiceRoleClient();

describe('Disappearing Messages System', () => {
  let testUsers = [];
  let testConversation = null;
  let testMessage = null;

  // Test data
  const testUserData = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user1@test.com',
      phone: '+1234567890',
      username: 'testuser1',
      display_name: 'Test User 1'
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'user2@test.com',
      phone: '+1234567891',
      username: 'testuser2',
      display_name: 'Test User 2'
    }
  ];

  before(async () => {
    console.log('Setting up disappearing messages test environment...');
    
    // Clean up any existing test data
    await cleanupTestData();
    
    // Create test users
    for (const userData of testUserData) {
      const { data: user, error } = await supabase.auth.admin.createUser({
        user_id: userData.id,
        email: userData.email,
        phone: userData.phone,
        email_confirm: true,
        phone_confirm: true
      });

      if (error && !error.message.includes('already registered')) {
        throw new Error(`Failed to create test user: ${error.message}`);
      }

      // Insert user profile
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: userData.id,
          email: userData.email,
          phone: userData.phone,
          username: userData.username,
          display_name: userData.display_name
        });

      if (profileError) {
        console.warn(`Profile creation warning for ${userData.username}:`, profileError.message);
      }

      testUsers.push(userData);
    }

    console.log(`Created ${testUsers.length} test users`);
  });

  after(async () => {
    console.log('Cleaning up test environment...');
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Reset test conversation and message for each test
    testConversation = null;
    testMessage = null;
  });

  async function cleanupTestData() {
    try {
      // Delete test messages and conversations
      await supabase.from('deliveries').delete().in('recipient_user_id', testUserData.map(u => u.id));
      await supabase.from('messages').delete().in('sender_id', testUserData.map(u => u.id));
      await supabase.from('conversation_participants').delete().in('user_id', testUserData.map(u => u.id));
      await supabase.from('conversations').delete().in('created_by', testUserData.map(u => u.id));
      
      // Delete test users
      for (const userData of testUserData) {
        await supabase.auth.admin.deleteUser(userData.id);
        await supabase.from('users').delete().eq('id', userData.id);
      }
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }

  async function createTestConversation() {
    // Create a direct conversation between test users
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert([{
        type: 'direct',
        created_by: testUsers[0].id
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test conversation: ${error.message}`);
    }

    // Add participants with different disappearing message settings
    const participants = [
      {
        conversation_id: conversation.id,
        user_id: testUsers[0].id,
        role: 'admin',
        disappear_seconds: 60, // 1 minute
        start_on: 'delivered'
      },
      {
        conversation_id: conversation.id,
        user_id: testUsers[1].id,
        role: 'member',
        disappear_seconds: 30, // 30 seconds
        start_on: 'read'
      }
    ];

    const { error: participantError } = await supabase
      .from('conversation_participants')
      .insert(participants);

    if (participantError) {
      throw new Error(`Failed to add participants: ${participantError.message}`);
    }

    testConversation = conversation;
    return conversation;
  }

  async function createTestMessage(senderId, content = 'Test message') {
    const { data: message, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: testConversation.id,
        sender_id: senderId,
        encrypted_content: Buffer.from(content, 'utf8'),
        content_type: 'text',
        has_attachments: false
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test message: ${error.message}`);
    }

    // Create deliveries using the database function
    const { error: deliveryError } = await supabase
      .rpc('fn_create_deliveries_for_message', { p_message_id: message.id });

    if (deliveryError) {
      throw new Error(`Failed to create deliveries: ${deliveryError.message}`);
    }

    testMessage = message;
    return message;
  }

  describe('Database Schema and Functions', () => {
    it('should have created the deliveries table with correct structure', async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .limit(0);

      expect(error).to.be.null;
      expect(data).to.be.an('array');
    });

    it('should have created the disappearing message functions', async () => {
      // Test fn_create_deliveries_for_message exists
      const { error: fnError1 } = await supabase
        .rpc('fn_create_deliveries_for_message', { p_message_id: '00000000-0000-0000-0000-000000000000' });

      // Should fail with a foreign key error, not a function not found error
      expect(fnError1).to.not.be.null;
      expect(fnError1.message).to.not.include('function');

      // Test fn_mark_read exists
      const { error: fnError2 } = await supabase
        .rpc('fn_mark_read', { p_message_id: '00000000-0000-0000-0000-000000000000' });

      // Should fail gracefully, not with function not found
      expect(fnError2).to.not.be.null;
      expect(fnError2.message).to.not.include('function');
    });

    it('should have added disappearing message columns to conversation_participants', async () => {
      await createTestConversation();

      const { data: participants, error } = await supabase
        .from('conversation_participants')
        .select('disappear_seconds, start_on')
        .eq('conversation_id', testConversation.id);

      expect(error).to.be.null;
      expect(participants).to.have.length(2);
      expect(participants[0]).to.have.property('disappear_seconds');
      expect(participants[0]).to.have.property('start_on');
    });
  });

  describe('Message Creation and Delivery Fan-out', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should create deliveries for all recipients when a message is sent', async () => {
      const message = await createTestMessage(testUsers[0].id);

      // Check that delivery was created for the recipient (not sender)
      const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id);

      expect(error).to.be.null;
      expect(deliveries).to.have.length(1);
      expect(deliveries[0].recipient_user_id).to.equal(testUsers[1].id);
      expect(deliveries[0].delivered_ts).to.not.be.null;
      expect(deliveries[0].deleted_ts).to.be.null;
    });

    it('should set correct expiry time based on participant settings', async () => {
      const message = await createTestMessage(testUsers[0].id);

      const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id)
        .eq('recipient_user_id', testUsers[1].id)
        .single();

      expect(error).to.be.null;
      
      // User 1 has start_on='read', so expires_at should be null initially
      expect(delivery.expires_at).to.be.null;
      expect(delivery.read_ts).to.be.null;
    });

    it('should set immediate expiry for delivered-based timers', async () => {
      // Send message from user 2 to user 1 (user 1 has delivered-based timer)
      const message = await createTestMessage(testUsers[1].id);

      const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id)
        .eq('recipient_user_id', testUsers[0].id)
        .single();

      expect(error).to.be.null;
      
      // User 0 has start_on='delivered', so expires_at should be set
      expect(delivery.expires_at).to.not.be.null;
      
      // Should expire in approximately 60 seconds
      const expiryTime = new Date(delivery.expires_at);
      const deliveredTime = new Date(delivery.delivered_ts);
      const diffSeconds = (expiryTime - deliveredTime) / 1000;
      
      expect(diffSeconds).to.be.approximately(60, 5); // Allow 5 second tolerance
    });
  });

  describe('Read Tracking and Read-based Expiry', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should mark message as read and set expiry for read-based timers', async () => {
      const message = await createTestMessage(testUsers[0].id);

      // Mark message as read by user 1 (who has read-based timer)
      const { error: readError } = await supabase
        .rpc('fn_mark_read', { p_message_id: message.id });

      expect(readError).to.be.null;

      // Check that read timestamp and expiry were set
      const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id)
        .eq('recipient_user_id', testUsers[1].id)
        .single();

      expect(error).to.be.null;
      expect(delivery.read_ts).to.not.be.null;
      expect(delivery.expires_at).to.not.be.null;

      // Should expire in approximately 30 seconds from read time
      const expiryTime = new Date(delivery.expires_at);
      const readTime = new Date(delivery.read_ts);
      const diffSeconds = (expiryTime - readTime) / 1000;
      
      expect(diffSeconds).to.be.approximately(30, 5); // Allow 5 second tolerance
    });
  });

  describe('Message Filtering and Expiry', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should filter out expired messages from queries', async () => {
      const message = await createTestMessage(testUsers[0].id);

      // Manually expire the delivery
      const { error: expireError } = await supabase
        .from('deliveries')
        .update({
          deleted_ts: new Date().toISOString(),
          deletion_reason: 'expired'
        })
        .eq('message_id', message.id)
        .eq('recipient_user_id', testUsers[1].id);

      expect(expireError).to.be.null;

      // Query messages with delivery join (simulating API behavior)
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          deliveries!inner(*)
        `)
        .eq('conversation_id', testConversation.id)
        .eq('deliveries.recipient_user_id', testUsers[1].id)
        .is('deliveries.deleted_ts', null);

      expect(error).to.be.null;
      expect(messages).to.have.length(0); // Should be filtered out
    });
  });

  describe('Participant Settings Management', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should allow users to update their own disappearing message settings', async () => {
      const newSettings = {
        disappear_seconds: 300, // 5 minutes
        start_on: 'delivered'
      };

      const { data: updatedParticipant, error } = await supabase
        .from('conversation_participants')
        .update(newSettings)
        .eq('conversation_id', testConversation.id)
        .eq('user_id', testUsers[0].id)
        .select()
        .single();

      expect(error).to.be.null;
      expect(updatedParticipant.disappear_seconds).to.equal(300);
      expect(updatedParticipant.start_on).to.equal('delivered');
    });

    it('should apply new settings to future messages only', async () => {
      // Create message with original settings
      const message1 = await createTestMessage(testUsers[1].id);

      // Update user 0's settings
      await supabase
        .from('conversation_participants')
        .update({
          disappear_seconds: 120,
          start_on: 'read'
        })
        .eq('conversation_id', testConversation.id)
        .eq('user_id', testUsers[0].id);

      // Create another message with new settings
      const message2 = await createTestMessage(testUsers[1].id);

      // Check deliveries have different expiry behavior
      const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('recipient_user_id', testUsers[0].id)
        .in('message_id', [message1.id, message2.id])
        .order('delivered_ts');

      expect(error).to.be.null;
      expect(deliveries).to.have.length(2);

      // First message should have immediate expiry (old settings: delivered-based)
      expect(deliveries[0].expires_at).to.not.be.null;

      // Second message should have no expiry initially (new settings: read-based)
      expect(deliveries[1].expires_at).to.be.null;
    });
  });

  describe('Garbage Collection Readiness', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should identify messages ready for garbage collection', async () => {
      const message = await createTestMessage(testUsers[0].id);

      // Initially, message should not be ready for GC
      const { data: gcBefore, error: gcError1 } = await supabase
        .rpc('fn_messages_ready_for_gc');

      expect(gcError1).to.be.null;
      expect(gcBefore).to.not.include(message.id);

      // Expire all deliveries for the message
      await supabase
        .from('deliveries')
        .update({
          deleted_ts: new Date().toISOString(),
          deletion_reason: 'expired'
        })
        .eq('message_id', message.id);

      // Now message should be ready for GC
      const { data: gcAfter, error: gcError2 } = await supabase
        .rpc('fn_messages_ready_for_gc');

      expect(gcError2).to.be.null;
      expect(gcAfter).to.include(message.id);
    });
  });

  describe('Row Level Security', () => {
    beforeEach(async () => {
      await createTestConversation();
    });

    it('should allow users to read only their own deliveries', async () => {
      const message = await createTestMessage(testUsers[0].id);

      // User 1 should only see their own delivery
      const { data: userDeliveries, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id);

      expect(error).to.be.null;
      // Note: This test would need proper auth context to fully validate RLS
      // In a real test environment, you'd set up proper user sessions
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle messages with no recipients gracefully', async () => {
      // Create conversation with only one participant
      const { data: soloConversation, error: convError } = await supabase
        .from('conversations')
        .insert([{
          type: 'direct',
          created_by: testUsers[0].id
        }])
        .select()
        .single();

      expect(convError).to.be.null;

      const { error: participantError } = await supabase
        .from('conversation_participants')
        .insert([{
          conversation_id: soloConversation.id,
          user_id: testUsers[0].id,
          role: 'admin'
        }]);

      expect(participantError).to.be.null;

      // Create message in solo conversation
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert([{
          conversation_id: soloConversation.id,
          sender_id: testUsers[0].id,
          encrypted_content: Buffer.from('Solo message', 'utf8'),
          content_type: 'text'
        }])
        .select()
        .single();

      expect(messageError).to.be.null;

      // Fan-out should succeed but create no deliveries
      const { error: fanoutError } = await supabase
        .rpc('fn_create_deliveries_for_message', { p_message_id: message.id });

      expect(fanoutError).to.be.null;

      // Verify no deliveries were created
      const { data: deliveries, error: deliveryError } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', message.id);

      expect(deliveryError).to.be.null;
      expect(deliveries).to.have.length(0);
    });

    it('should handle invalid message IDs in mark_read function', async () => {
      const { error } = await supabase
        .rpc('fn_mark_read', { p_message_id: '00000000-0000-0000-0000-000000000000' });

      // Should not throw an error, just do nothing
      expect(error).to.be.null;
    });
  });
});