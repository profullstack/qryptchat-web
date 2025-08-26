/**
 * @fileoverview Integration tests for SMS notification system
 * Tests the complete flow from database functions to SMS service
 */

import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';

describe('SMS Notification System Integration', () => {
  let mockSupabase;
  let mockUsers;
  let mockConversations;

  beforeEach(() => {
    // Mock database state
    mockUsers = [
      {
        id: 1,
        username: 'alice',
        display_name: 'Alice Smith',
        phone_number: '+1234567890',
        sms_notifications_enabled: true,
        last_active_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        is_online: false
      },
      {
        id: 2,
        username: 'bob',
        display_name: 'Bob Johnson',
        phone_number: '+1987654321',
        sms_notifications_enabled: true,
        last_active_at: new Date().toISOString(), // Active now
        is_online: true
      },
      {
        id: 3,
        username: 'charlie',
        display_name: 'Charlie Brown',
        phone_number: '+1555666777',
        sms_notifications_enabled: false, // Disabled SMS
        last_active_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
        is_online: false
      }
    ];

    mockConversations = [
      {
        id: 'conv-123',
        participants: [1, 2, 3] // Alice, Bob, Charlie
      }
    ];

    // Mock Supabase client
    mockSupabase = {
      rpc: async (functionName, params) => {
        switch (functionName) {
          case 'update_user_activity':
            const user = mockUsers.find(u => u.id === params.user_id);
            if (user) {
              user.last_active_at = new Date().toISOString();
              user.is_online = true;
            }
            return { data: null, error: null };

          case 'get_inactive_participants':
            const conversation = mockConversations.find(c => c.id === params.conversation_id);
            if (!conversation) {
              return { data: [], error: null };
            }

            const inactiveThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
            const inactiveUsers = mockUsers.filter(user => {
              const isParticipant = conversation.participants.includes(user.id);
              const isInactive = new Date(user.last_active_at) < inactiveThreshold;
              const hasNotificationsEnabled = user.sms_notifications_enabled;
              const hasPhoneNumber = !!user.phone_number;

              return isParticipant && isInactive && hasNotificationsEnabled && hasPhoneNumber;
            });

            return { data: inactiveUsers, error: null };

          case 'log_sms_notification':
            // Mock logging - just return success
            return { data: null, error: null };

          default:
            return { data: null, error: { message: `Unknown function: ${functionName}` } };
        }
      }
    };
  });

  describe('User Activity Tracking', () => {
    it('should update user activity when called', async () => {
      const userId = 1;
      const userBefore = mockUsers.find(u => u.id === userId);
      const lastActiveBefore = userBefore.last_active_at;

      // Simulate activity update
      await mockSupabase.rpc('update_user_activity', { user_id: userId });

      const userAfter = mockUsers.find(u => u.id === userId);
      expect(userAfter.last_active_at).to.not.equal(lastActiveBefore);
      expect(userAfter.is_online).to.be.true;
    });
  });

  describe('Inactive Participant Detection', () => {
    it('should identify inactive participants correctly', async () => {
      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'conv-123'
      });

      expect(inactiveParticipants).to.have.length(1);
      expect(inactiveParticipants[0].id).to.equal(1); // Alice is inactive but has SMS enabled
      expect(inactiveParticipants[0].username).to.equal('alice');
    });

    it('should exclude users with SMS notifications disabled', async () => {
      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'conv-123'
      });

      // Charlie is inactive but has SMS disabled, so should not be included
      const charlieIncluded = inactiveParticipants.some(p => p.id === 3);
      expect(charlieIncluded).to.be.false;
    });

    it('should exclude active users', async () => {
      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'conv-123'
      });

      // Bob is active, so should not be included
      const bobIncluded = inactiveParticipants.some(p => p.id === 2);
      expect(bobIncluded).to.be.false;
    });

    it('should return empty array for non-existent conversation', async () => {
      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'non-existent'
      });

      expect(inactiveParticipants).to.have.length(0);
    });
  });

  describe('SMS Notification Logging', () => {
    it('should log SMS notification attempts', async () => {
      const result = await mockSupabase.rpc('log_sms_notification', {
        p_user_id: 1,
        p_conversation_id: 'conv-123',
        p_phone_number: '+1234567890',
        p_message: 'Test message',
        p_success: true,
        p_message_id: 'sms-123',
        p_error_message: null
      });

      expect(result.error).to.be.null;
    });
  });

  describe('End-to-End SMS Flow Simulation', () => {
    it('should complete full SMS notification flow', async () => {
      const conversationId = 'conv-123';
      const senderId = 2; // Bob (active user)
      const messageContent = 'Hello everyone!';

      // Step 1: Update sender activity
      await mockSupabase.rpc('update_user_activity', { user_id: senderId });

      // Step 2: Get inactive participants
      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: conversationId
      });

      expect(inactiveParticipants).to.have.length(1);
      expect(inactiveParticipants[0].id).to.equal(1); // Alice

      // Step 3: Simulate SMS sending for each inactive participant
      const smsResults = [];
      for (const participant of inactiveParticipants) {
        // Mock SMS sending
        const smsSuccess = true; // Assume success for test
        const messageId = `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // Log the notification
        await mockSupabase.rpc('log_sms_notification', {
          p_user_id: participant.id,
          p_conversation_id: conversationId,
          p_phone_number: participant.phone_number,
          p_message: `Bob Johnson: ${messageContent}`,
          p_success: smsSuccess,
          p_message_id: messageId,
          p_error_message: null
        });

        smsResults.push({
          userId: participant.id,
          phoneNumber: participant.phone_number,
          success: smsSuccess,
          messageId
        });
      }

      expect(smsResults).to.have.length(1);
      expect(smsResults[0].userId).to.equal(1);
      expect(smsResults[0].phoneNumber).to.equal('+1234567890');
      expect(smsResults[0].success).to.be.true;
    });
  });

  describe('Edge Cases', () => {
    it('should handle conversation with no participants', async () => {
      mockConversations.push({ id: 'empty-conv', participants: [] });

      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'empty-conv'
      });

      expect(inactiveParticipants).to.have.length(0);
    });

    it('should handle all participants being active', async () => {
      // Make all users active
      mockUsers.forEach(user => {
        user.last_active_at = new Date().toISOString();
        user.is_online = true;
      });

      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'conv-123'
      });

      expect(inactiveParticipants).to.have.length(0);
    });

    it('should handle users without phone numbers', async () => {
      // Remove phone number from Alice
      const alice = mockUsers.find(u => u.id === 1);
      alice.phone_number = null;

      const { data: inactiveParticipants } = await mockSupabase.rpc('get_inactive_participants', {
        conversation_id: 'conv-123'
      });

      expect(inactiveParticipants).to.have.length(0);
    });
  });
});