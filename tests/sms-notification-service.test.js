/**
 * @fileoverview Tests for SMS notification service for inactive users
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { SMSNotificationService } from '../src/lib/services/sms-notification-service.js';

describe('SMSNotificationService', () => {
  let smsService;
  let mockSupabase;
  let mockSMSProvider;

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      rpc: async (functionName, params) => {
        switch (functionName) {
          case 'get_inactive_participants':
            return {
              data: [
                {
                  user_id: 1,
                  phone_number: '+1234567890',
                  display_name: 'John Doe',
                  last_active_at: '2025-08-25T05:00:00Z'
                }
              ],
              error: null
            };
          case 'log_sms_notification':
            return { data: null, error: null };
          default:
            return { data: null, error: null };
        }
      }
    };

    // Mock SMS provider
    mockSMSProvider = {
      sendSMS: async (phoneNumber, message) => {
        return { success: true, messageId: 'mock-123' };
      }
    };

    smsService = new SMSNotificationService(mockSupabase, mockSMSProvider);
  });

  describe('constructor', () => {
    it('should initialize with supabase and SMS provider', () => {
      expect(smsService.supabase).to.equal(mockSupabase);
      expect(smsService.smsProvider).to.equal(mockSMSProvider);
    });

    it('should throw error if supabase client is missing', () => {
      expect(() => new SMSNotificationService(null, mockSMSProvider))
        .to.throw('Supabase client is required');
    });

    it('should throw error if SMS provider is missing', () => {
      expect(() => new SMSNotificationService(mockSupabase, null))
        .to.throw('SMS provider is required');
    });
  });

  describe('notifyInactiveParticipants', () => {
    it('should send SMS notifications to inactive participants', async () => {
      const conversationId = 'conv-123';
      const senderName = 'Alice';
      const messagePreview = 'Hello there!';

      const result = await smsService.notifyInactiveParticipants(
        conversationId,
        senderName,
        messagePreview
      );

      expect(result.success).to.be.true;
      expect(result.notificationsSent).to.equal(1);
      expect(result.details).to.have.length(1);
      expect(result.details[0].phoneNumber).to.equal('+1234567890');
      expect(result.details[0].success).to.be.true;
    });

    it('should handle empty inactive participants list', async () => {
      mockSupabase.rpc = async () => ({ data: [], error: null });

      const result = await smsService.notifyInactiveParticipants(
        'conv-123',
        'Alice',
        'Hello'
      );

      expect(result.success).to.be.true;
      expect(result.notificationsSent).to.equal(0);
      expect(result.details).to.have.length(0);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.rpc = async () => ({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      const result = await smsService.notifyInactiveParticipants(
        'conv-123',
        'Alice',
        'Hello'
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Database error');
    });

    it('should continue sending even if some SMS fail', async () => {
      mockSupabase.rpc = async (functionName) => {
        if (functionName === 'get_inactive_participants') {
          return {
            data: [
              { user_id: 1, phone_number: '+1111111111', display_name: 'User1' },
              { user_id: 2, phone_number: '+2222222222', display_name: 'User2' }
            ],
            error: null
          };
        }
        return { data: null, error: null };
      };

      let callCount = 0;
      mockSMSProvider.sendSMS = async (phoneNumber) => {
        callCount++;
        if (phoneNumber === '+1111111111') {
          throw new Error('SMS failed');
        }
        return { success: true, messageId: 'mock-123' };
      };

      const result = await smsService.notifyInactiveParticipants(
        'conv-123',
        'Alice',
        'Hello'
      );

      expect(result.success).to.be.true;
      expect(result.notificationsSent).to.equal(1);
      expect(result.details).to.have.length(2);
      expect(result.details[0].success).to.be.false;
      expect(result.details[1].success).to.be.true;
    });
  });

  describe('formatNotificationMessage', () => {
    it('should format message with sender name and preview', () => {
      const message = smsService.formatNotificationMessage('Alice', 'Hello there!');
      expect(message).to.include('Alice');
      expect(message).to.include('Hello there!');
    });

    it('should truncate long message previews', () => {
      const longMessage = 'A'.repeat(200);
      const message = smsService.formatNotificationMessage('Alice', longMessage);
      expect(message.length).to.be.lessThan(160); // SMS length limit
    });

    it('should handle empty sender name', () => {
      const message = smsService.formatNotificationMessage('', 'Hello');
      expect(message).to.include('Someone');
      expect(message).to.include('Hello');
    });

    it('should handle empty message preview', () => {
      const message = smsService.formatNotificationMessage('Alice', '');
      expect(message).to.include('Alice');
      expect(message).to.include('sent you a message');
    });
  });

  describe('validateInputs', () => {
    it('should validate required parameters', () => {
      expect(() => smsService.validateInputs('', 'Alice', 'Hello'))
        .to.throw('Conversation ID is required');
      
      expect(() => smsService.validateInputs('conv-123', '', 'Hello'))
        .to.throw('Sender name is required');
      
      expect(() => smsService.validateInputs('conv-123', 'Alice', ''))
        .to.throw('Message preview is required');
    });

    it('should pass validation with valid inputs', () => {
      expect(() => smsService.validateInputs('conv-123', 'Alice', 'Hello'))
        .to.not.throw();
    });
  });
});