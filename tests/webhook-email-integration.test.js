import { expect } from 'chai';
import sinon from 'sinon';
import { createSMSWebhookEmailService } from '../src/lib/services/mailgun-email-service.js';

describe('Webhook Email Integration - Unit Tests', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Store original env
    originalEnv = {
      MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
      MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN
    };
  });

  afterEach(() => {
    // Restore original env
    process.env.MAILGUN_API_KEY = originalEnv.MAILGUN_API_KEY;
    process.env.MAILGUN_DOMAIN = originalEnv.MAILGUN_DOMAIN;
    sinon.restore();
  });

  describe('createSMSWebhookEmailService integration', () => {
    it('should create and use email service for webhook alerts', async () => {
      // Set up environment
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      const emailService = createSMSWebhookEmailService();
      expect(emailService).to.not.be.null;

      // Mock the internal mailgun client
      const mockMessages = {
        create: sinon.stub().resolves({
          id: '<test-message-id>',
          message: 'Queued. Thank you.'
        })
      };
      
      emailService.mg = { messages: mockMessages };

      // Test webhook payload formatting and sending
      const webhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-123',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '654321'
          }
        }
      };

      const result = await emailService.sendSMSWebhookAlert(webhookPayload);

      // Verify email was sent successfully
      expect(result.success).to.be.true;
      expect(result.messageId).to.equal('<test-message-id>');
      
      // Verify correct email data was sent
      expect(mockMessages.create.calledOnce).to.be.true;
      const [domain, emailData] = mockMessages.create.firstCall.args;
      
      expect(domain).to.equal('mg.test.com');
      expect(emailData.to).to.equal('otp@qrypt.chat'); // Uses default since OTP_TO_EMAIL not set
      expect(emailData.subject).to.include('SMS Webhook Alert');
      expect(emailData.text).to.include('message.received');
      expect(emailData.text).to.include('+1234567890');
      expect(emailData.text).to.include('654321');
      expect(emailData.from).to.equal('webhook-alerts@mg.test.com'); // Uses default since FROM_EMAIL not set
    });

    it('should handle service creation failure gracefully', () => {
      // Don't set MAILGUN_API_KEY
      delete process.env.MAILGUN_API_KEY;

      const emailService = createSMSWebhookEmailService();
      expect(emailService).to.be.null;
    });

    it('should format webhook payload correctly for different event types', async () => {
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';
      process.env.OTP_TO_EMAIL = 'test-otp@qrypt.chat';
      process.env.FROM_EMAIL = 'test-from@qrypt.chat';

      const emailService = createSMSWebhookEmailService();
      
      const mockMessages = {
        create: sinon.stub().resolves({ id: '<test-id>' })
      };
      emailService.mg = { messages: mockMessages };

      // Test different event types
      const webhookPayload = {
        data: {
          event_type: 'message.sent',
          payload: {
            id: 'msg-456',
            from: { phone_number: '+1111111111' },
            to: [{ phone_number: '+2222222222' }],
            text: 'Hello World',
            direction: 'outbound'
          }
        }
      };

      const result = await emailService.sendSMSWebhookAlert(webhookPayload);
      expect(result.success).to.be.true;

      const emailData = mockMessages.create.firstCall.args[1];
      expect(emailData.text).to.include('message.sent');
      expect(emailData.text).to.include('outbound');
      expect(emailData.text).to.include('Hello World');
      expect(emailData.to).to.equal('test-otp@qrypt.chat');
      expect(emailData.from).to.equal('test-from@qrypt.chat');
    });

    it('should include raw payload in email content', async () => {
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      const emailService = createSMSWebhookEmailService();
      
      const mockMessages = {
        create: sinon.stub().resolves({ id: '<test-id>' })
      };
      emailService.mg = { messages: mockMessages };

      const webhookPayload = {
        data: {
          event_type: 'message.received',
          payload: { id: 'test-msg', custom_field: 'custom_value' }
        }
      };

      await emailService.sendSMSWebhookAlert(webhookPayload);

      const emailData = mockMessages.create.firstCall.args[1];
      expect(emailData.text).to.include('--- Raw Payload ---');
      expect(emailData.text).to.include('custom_field');
      expect(emailData.text).to.include('custom_value');
      
      // Clean up additional env vars
      delete process.env.OTP_TO_EMAIL;
      delete process.env.FROM_EMAIL;
    });
  });
});