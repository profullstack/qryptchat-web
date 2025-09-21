import { expect } from 'chai';
import sinon from 'sinon';
import { MailgunEmailService } from '../src/lib/services/mailgun-email-service.js';

describe('MailgunEmailService', () => {
  let mockMailgun;
  let mockMessages;
  let emailService;

  beforeEach(() => {
    mockMessages = {
      create: sinon.stub()
    };

    mockMailgun = {
      messages: mockMessages
    };

    emailService = new MailgunEmailService({
      apiKey: 'test-api-key',
      domain: 'mg.qrypt.chat'
    });

    // Replace the internal mailgun client with our mock
    emailService.mg = mockMailgun;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should throw error when apiKey is missing', () => {
      expect(() => new MailgunEmailService({ domain: 'test.com' }))
        .to.throw('Mailgun API key is required');
    });

    it('should throw error when domain is missing', () => {
      expect(() => new MailgunEmailService({ apiKey: 'test-key' }))
        .to.throw('Mailgun domain is required');
    });

    it('should initialize with valid configuration', () => {
      const service = new MailgunEmailService({
        apiKey: 'test-key',
        domain: 'test.com'
      });
      expect(service).to.be.instanceOf(MailgunEmailService);
    });
  });

  describe('sendEmail', () => {
    const validEmailData = {
      to: 'test@example.com',
      subject: 'Test Subject',
      text: 'Test message',
      from: 'sender@test.com'
    };

    it('should send email successfully', async () => {
      const mockResponse = { 
        id: '<message-id>',
        message: 'Queued. Thank you.'
      };
      mockMessages.create.resolves(mockResponse);

      const result = await emailService.sendEmail(validEmailData);

      expect(mockMessages.create.calledOnce).to.be.true;
      expect(mockMessages.create.firstCall.args[0]).to.equal('mg.qrypt.chat');
      expect(mockMessages.create.firstCall.args[1]).to.deep.include({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message',
        from: 'sender@test.com'
      });
      expect(result).to.deep.equal({
        success: true,
        messageId: '<message-id>',
        response: mockResponse
      });
    });

    it('should handle missing required fields', async () => {
      const invalidData = { subject: 'Test' };

      const result = await emailService.sendEmail(invalidData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Missing required email fields');
      expect(mockMessages.create.called).to.be.false;
    });

    it('should handle Mailgun API errors', async () => {
      const apiError = new Error('Mailgun API Error');
      mockMessages.create.rejects(apiError);

      const result = await emailService.sendEmail(validEmailData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Failed to send email');
      expect(result.details).to.equal('Mailgun API Error');
    });

    it('should use default from address when not provided', async () => {
      const dataWithoutFrom = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message'
      };
      
      const mockResponse = { id: '<message-id>' };
      mockMessages.create.resolves(mockResponse);

      await emailService.sendEmail(dataWithoutFrom);

      expect(mockMessages.create.firstCall.args[1].from)
        .to.equal('noreply@mg.qrypt.chat');
    });
  });

  describe('sendSMSWebhookAlert', () => {
    it('should format and send SMS webhook payload email', async () => {
      const webhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-123',
            from: { phone_number: '+1234567890' },
            to: [{ phone_number: '+0987654321' }],
            text: '123456'
          }
        }
      };

      const mockResponse = { id: '<message-id>' };
      mockMessages.create.resolves(mockResponse);

      const result = await emailService.sendSMSWebhookAlert(webhookPayload);

      expect(result.success).to.be.true;
      expect(mockMessages.create.calledOnce).to.be.true;

      const emailData = mockMessages.create.firstCall.args[1];
      expect(emailData.to).to.equal('otp@qrypt.chat');
      expect(emailData.subject).to.include('SMS Webhook Alert');
      expect(emailData.text).to.include('message.received');
      expect(emailData.text).to.include('+1234567890');
      expect(emailData.text).to.include('123456');
    });

    it('should handle webhook payload formatting errors', async () => {
      const invalidPayload = null;

      const result = await emailService.sendSMSWebhookAlert(invalidPayload);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid webhook payload');
    });
  });

  describe('createSMSWebhookEmailService', () => {
    it('should create service with environment variables', async () => {
      // Mock environment variables
      process.env.MAILGUN_API_KEY = 'test-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.qrypt.chat';

      const { createSMSWebhookEmailService } = await import('../src/lib/services/mailgun-email-service.js');
      const service = createSMSWebhookEmailService();

      expect(service).to.be.instanceOf(MailgunEmailService);

      // Clean up
      delete process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_DOMAIN;
    });

    it('should return null when environment variables are missing', async () => {
      const { createSMSWebhookEmailService } = await import('../src/lib/services/mailgun-email-service.js');
      const service = createSMSWebhookEmailService();

      expect(service).to.be.null;
    });
  });
});