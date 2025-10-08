# Scripts

Utility scripts for testing and debugging.

## test-twilio-sms.js

Test Twilio SMS sending directly, bypassing Supabase.

### Usage

```bash
node scripts/test-twilio-sms.js <phone-number> [message]
```

### Arguments

- `phone-number` - Destination phone number in E.164 format (e.g., +14155551234)
- `message` - Optional message text (default: "Test message from Twilio")

### Environment Variables Required

The script requires these environment variables in your `.env` file:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

Alternative names are also supported:
- `TWILIO_SID` instead of `TWILIO_ACCOUNT_SID`
- `TWILIO_SECRET` instead of `TWILIO_AUTH_TOKEN`

### Examples

Send a test message:
```bash
node scripts/test-twilio-sms.js +14155551234
```

Send a custom message:
```bash
node scripts/test-twilio-sms.js +14155551234 "Hello from Twilio!"
```

Show help:
```bash
node scripts/test-twilio-sms.js --help
```

### What It Does

1. Validates your phone number format
2. Checks for required environment variables
3. Sends SMS directly via Twilio API
4. Displays detailed results including:
   - Message SID (for tracking in Twilio Console)
   - Delivery status
   - Price information
   - Timestamp
5. Provides troubleshooting tips if errors occur

### Troubleshooting

If you get an error:

1. **Authentication Error (20003)**
   - Check your `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
   - Verify credentials at https://console.twilio.com/

2. **Unverified Number (21610)**
   - Trial accounts can only send to verified numbers
   - Verify your number at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
   - Or upgrade to a paid account

3. **Invalid Phone Number (21211)**
   - Ensure number is in E.164 format: +[country code][number]
   - Example: +14155551234 (not 4155551234)

4. **Message Sent But Not Received**
   - Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms
   - Search for the Message SID shown in the output
   - Check delivery status and error codes

### Next Steps After Running

1. Check your phone for the SMS
2. If not received, check Twilio Console logs
3. Look for the Message SID in Twilio logs
4. Check delivery status (queued → sent → delivered)
5. Review any error codes in Twilio logs

### Common Status Values

- `queued` - Message queued for sending
- `sending` - Message is being sent
- `sent` - Message sent to carrier
- `delivered` - Message delivered to phone ✅
- `failed` - Message failed to send ❌
- `undelivered` - Carrier could not deliver ❌

### Related Documentation

- [SMS Configuration Fix Guide](../docs/SMS_CONFIGURATION_FIX.md)
- [SMS Delivery Troubleshooting](../docs/SMS_DELIVERY_TROUBLESHOOTING.md)
- [Twilio Error Codes](https://www.twilio.com/docs/api/errors)