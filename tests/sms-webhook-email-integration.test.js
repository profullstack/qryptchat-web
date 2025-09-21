import { expect } from 'chai';
import sinon from 'sinon';

describe('SMS Webhook Email Integration', () => {
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

  describe('SMS Webhook POST handler', () => {
    it('should send email alert when receiving SMS webhook', async () => {
      // Set up environment
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      // Mock the mailgun email service
      const mockEmailService = {
        sendSMSWebhookAlert: sinon.stub().resolves({
          success: true,
          messageId: 'test-message-id'
        })
      };

      // Mock the createSMSWebhookEmailService function
      const mailgunModule = await import('../src/lib/services/mailgun-email-service.js');
      const createServiceStub = sinon.stub(mailgunModule, 'createSMSWebhookEmailService')
        .returns(mockEmailService);

      // Import the webhook handler
      const webhookModule = await import('../src/routes/api/webhooks/telnyx/sms/+server.js');
      
      // Create mock request
      const mockWebhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-test-123',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '123456'
          }
        }
      };

      const mockRequest = {
        json: sinon.stub().resolves(mockWebhookPayload)
      };

      // Mock console.log to capture webhook logs
      const consoleLogStub = sinon.stub(console, 'log');

      // Call the webhook handler
      const response = await webhookModule.POST({ request: mockRequest });
      const responseBody = await response.json();

      // Verify email service was called
      expect(createServiceStub.calledOnce).to.be.true;
      expect(mockEmailService.sendSMSWebhookAlert.calledOnce).to.be.true;
      expect(mockEmailService.sendSMSWebhookAlert.firstCall.args[0]).to.deep.equal(mockWebhookPayload);

      // Verify webhook processing continued normally
      expect(responseBody.status).to.equal('ignored'); // Because it's not a valid OTP
      
      // Verify email notification was logged
      expect(consoleLogStub.calledWith(
        sinon.match('[TELNYX-WEBHOOK] Email notification sent:'),
        sinon.match.object
      )).to.be.true;
    });

    it('should continue webhook processing even if email fails', async () => {
      // Set up environment
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      // Mock the mailgun email service to fail
      const mockEmailService = {
        sendSMSWebhookAlert: sinon.stub().rejects(new Error('Email failed'))
      };

      const mailgunModule = await import('../src/lib/services/mailgun-email-service.js');
      const createServiceStub = sinon.stub(mailgunModule, 'createSMSWebhookEmailService')
        .returns(mockEmailService);

      // Import the webhook handler
      const webhookModule = await import('../src/routes/api/webhooks/telnyx/sms/+server.js');

      const mockWebhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-test-123',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '123456'
          }
        }
      };

      const mockRequest = {
        json: sinon.stub().resolves(mockWebhookPayload)
      };

      const consoleErrorStub = sinon.stub(console, 'error');

      // Call the webhook handler
      const response = await webhookModule.POST({ request: mockRequest });
      const responseBody = await response.json();

      // Verify email service was called
      expect(createServiceStub.calledOnce).to.be.true;
      expect(mockEmailService.sendSMSWebhookAlert.calledOnce).to.be.true;

      // Verify webhook processing continued despite email failure
      expect(responseBody.status).to.equal('ignored'); // Because it's not a valid OTP
      expect(response.status).to.equal(200); // Should still return success

      // Verify error was logged
      expect(consoleErrorStub.calledWith(
        '[TELNYX-WEBHOOK] Failed to send email notification:',
        sinon.match.instanceOf(Error)
      )).to.be.true;
    });

    it('should handle missing email service gracefully', async () => {
      // Don't set MAILGUN_API_KEY (simulate missing config)
      delete process.env.MAILGUN_API_KEY;

      // Mock the createSMSWebhookEmailService to return null
      const mailgunModule = await import('../src/lib/services/mailgun-email-service.js');
      const createServiceStub = sinon.stub(mailgunModule, 'createSMSWebhookEmailService')
        .returns(null);

      // Import the webhook handler
      const webhookModule = await import('../src/routes/api/webhooks/telnyx/sms/+server.js');

      const mockWebhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-test-123',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '123456'
          }
        }
      };

      const mockRequest = {
        json: sinon.stub().resolves(mockWebhookPayload)
      };

      const consoleLogStub = sinon.stub(console, 'log');

      // Call the webhook handler
      const response = await webhookModule.POST({ request: mockRequest });
      const responseBody = await response.json();

      // Verify service creation was attempted
      expect(createServiceStub.calledOnce).to.be.true;

      // Verify webhook processing continued normally
      expect(responseBody.status).to.equal('ignored');
      expect(response.status).to.equal(200);

      // Verify appropriate message was logged
      expect(consoleLogStub.calledWith(
        '[TELNYX-WEBHOOK] Email service not configured, skipping email notification'
      )).to.be.true;
    });

    it('should properly format valid OTP webhook for email', async () => {
      // Set up environment
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.test.com';

      const mockEmailService = {
        sendSMSWebhookAlert: sinon.stub().resolves({
          success: true,
          messageId: 'test-message-id'
        })
      };

      const mailgunModule = await import('../src/lib/services/mailgun-email-service.js');
      sinon.stub(mailgunModule, 'createSMSWebhookEmailService').returns(mockEmailService);

      // Mock Supabase to simulate successful OTP verification
      const mockSupabase = {
        auth: {
          verifyOtp: sinon.stub().resolves({
            data: { user: { id: 'test-user-id' } },
            error: null
          })
        }
      };

      // Import and mock the createServiceRoleClient
      const supabaseModule = await import('../src/lib/supabase/service-role.js');
      sinon.stub(supabaseModule, 'createServiceRoleClient').returns(mockSupabase);

      const webhookModule = await import('../src/routes/api/webhooks/telnyx/sms/+server.js');

      const mockWebhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-test-456',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '654321' // Valid 6-digit OTP
          }
        }
      };

      const mockRequest = {
        json: sinon.stub().resolves(mockWebhookPayload)
      };

      // Call the webhook handler
      const response = await webhookModule.POST({ request: mockRequest });
      const responseBody = await response.json();

      // Verify email was sent with the webhook payload
      expect(mockEmailService.sendSMSWebhookAlert.calledOnce).to.be.true;
      expect(mockEmailService.sendSMSWebhookAlert.firstCall.args[0]).to.deep.equal(mockWebhookPayload);

      // Verify webhook processed the OTP successfully
      expect(responseBody.status).to.equal('success');
      expect(responseBody.userId).to.equal('test-user-id');
    });
  });
});