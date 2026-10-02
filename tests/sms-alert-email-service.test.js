import { afterEach, describe, expect, it, vi } from 'vitest';
import { SMSAlertEmailService, createSMSWebhookEmailService } from '../src/lib/services/sms-alert-email-service.js';

function okFetch(id = 'resend-msg-1') {
  return vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 }));
}

const webhookPayload = {
  data: {
    event_type: 'message.received',
    payload: {
      id: 'msg-123',
      from: { phone_number: '+1234567890' },
      to: [{ phone_number: '+0987654321' }],
      text: '654321',
      direction: 'inbound'
    }
  }
};

describe('SMSAlertEmailService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires an API key', () => {
    expect(() => new SMSAlertEmailService({})).toThrow('Resend API key is required');
  });

  it('posts a Resend payload with a bearer key', async () => {
    const fetchImpl = okFetch();
    const svc = new SMSAlertEmailService({ apiKey: 're_test', fetchImpl });
    const result = await svc.sendEmail({ to: 'a@qrypt.chat', subject: 'Hi', text: 'Body' });

    expect(result).toMatchObject({ success: true, messageId: 'resend-msg-1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({ from: 'noreply@qrypt.chat', to: ['a@qrypt.chat'], subject: 'Hi', text: 'Body' });
  });

  it('rejects a message missing required fields without calling Resend', async () => {
    const fetchImpl = okFetch();
    const svc = new SMSAlertEmailService({ apiKey: 're_test', fetchImpl });
    const result = await svc.sendEmail({ to: 'a@qrypt.chat' });
    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a Resend refusal as a failure instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'The qrypt.chat domain is not verified' }), { status: 403 }));
    const svc = new SMSAlertEmailService({ apiKey: 're_test', fetchImpl });
    const result = await svc.sendEmail({ to: 'a@qrypt.chat', subject: 'Hi', text: 'Body' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('forwards an inbound SMS to the OTP inbox from FROM_EMAIL', async () => {
    vi.stubEnv('OTP_TO_EMAIL', 'otp@qrypt.chat');
    vi.stubEnv('FROM_EMAIL', 'hello@qrypt.chat');
    const fetchImpl = okFetch();
    const svc = new SMSAlertEmailService({ apiKey: 're_test', fetchImpl });
    const result = await svc.sendSMSWebhookAlert(webhookPayload);

    expect(result.success).toBe(true);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.to).toEqual(['otp@qrypt.chat']);
    expect(sent.from).toBe('hello@qrypt.chat');
    expect(sent.subject).toMatch(/^SMS Webhook Alert - /);
    expect(sent.text).toContain('- From: +1234567890');
    expect(sent.text).toContain('- Text: 654321');
  });

  it('rejects a missing webhook payload', async () => {
    const svc = new SMSAlertEmailService({ apiKey: 're_test', fetchImpl: okFetch() });
    expect((await svc.sendSMSWebhookAlert(null)).success).toBe(false);
  });

  it('is disabled, not broken, without RESEND_API_KEY', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(createSMSWebhookEmailService()).toBeNull();
  });

  it('is configured from RESEND_API_KEY', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const svc = createSMSWebhookEmailService();
    expect(svc).toBeInstanceOf(SMSAlertEmailService);
    expect(svc.domain).toBe('qrypt.chat');
  });
});
