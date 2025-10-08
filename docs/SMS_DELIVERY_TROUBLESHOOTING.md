# SMS Delivery Troubleshooting Guide

## Issue: API Returns Success But No SMS Received

If the API returns "success" but you're not receiving SMS messages, this indicates the message was accepted by Twilio but not delivered to your phone. Here are the most common causes and solutions:

## Common Causes

### 1. Trial Account Restrictions (Most Common)

**Symptom:** API succeeds, but no SMS arrives
**Cause:** Twilio trial accounts can ONLY send to verified phone numbers

**Solution:**
1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to: **Phone Numbers** → **Manage** → **Verified Caller IDs**
3. Click **Add a new number**
4. Enter your phone number and verify it via SMS or call
5. Try sending SMS again after verification

**OR upgrade to a paid Twilio account** to send to any number.

### 2. Carrier Filtering/Blocking

**Symptom:** Some numbers receive SMS, others don't
**Cause:** Mobile carriers may filter or block messages from certain numbers

**Common Reasons:**
- Message content triggers spam filters
- Sender number is flagged
- Carrier-specific restrictions
- International SMS restrictions

**Solution:**
1. Check Twilio logs (see below) for delivery status
2. Try a different phone number
3. Ensure message content doesn't look like spam
4. For production, use a Twilio Messaging Service with proper sender registration

### 3. Phone Number Issues

**Symptom:** Specific numbers never receive SMS
**Cause:** Number may be:
- Landline (cannot receive SMS)
- VoIP number (may not support SMS)
- Ported number with carrier issues
- Invalid or disconnected

**Solution:**
1. Verify the number can receive SMS from other sources
2. Try a different phone number
3. Check Twilio logs for specific error codes

### 4. Geographic/Regulatory Restrictions

**Symptom:** International numbers don't receive SMS
**Cause:** Twilio may have restrictions for certain countries

**Solution:**
1. Check [Twilio's SMS coverage](https://www.twilio.com/guidelines/sms)
2. Ensure your Twilio account has international SMS enabled
3. Some countries require sender registration

### 5. Message Delays

**Symptom:** SMS arrives much later (minutes to hours)
**Cause:** Carrier congestion or routing issues

**Solution:**
- Wait 5-10 minutes before assuming failure
- Check Twilio logs for delivery status
- Consider using a Messaging Service for better reliability

## How to Check Twilio Logs

This is the MOST IMPORTANT step to diagnose delivery issues:

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to: **Monitor** → **Logs** → **Messages**
3. Find your recent message (search by phone number or time)
4. Check the **Status** column:
   - ✅ **Delivered**: Message was delivered successfully
   - ⏳ **Sent**: Message sent to carrier, awaiting delivery confirmation
   - ❌ **Failed**: Message failed to deliver (check error code)
   - ⚠️ **Undelivered**: Carrier couldn't deliver (check error code)

5. Click on the message for detailed information:
   - Error codes (if any)
   - Delivery timestamps
   - Carrier information
   - Price

### Common Twilio Error Codes

- **30003**: Unreachable destination (invalid number or carrier issue)
- **30004**: Message blocked by carrier
- **30005**: Unknown destination (number doesn't exist)
- **30006**: Landline or unreachable carrier
- **30007**: Carrier violation (spam filter)
- **30008**: Unknown error from carrier

## Quick Diagnostic Checklist

Run through this checklist:

- [ ] Is your Twilio account a trial account?
  - If YES: Is the destination number verified in Twilio Console?
- [ ] Check Twilio logs - what's the message status?
- [ ] Can the phone number receive SMS from other sources?
- [ ] Is it a mobile number (not landline or VoIP)?
- [ ] Have you waited at least 5 minutes?
- [ ] Is the phone number in E.164 format (+1XXXXXXXXXX)?
- [ ] Does your Twilio account have sufficient balance?
- [ ] Are you sending to an international number?
  - If YES: Does your account support international SMS?

## Testing Steps

### Step 1: Verify Twilio Configuration
```bash
# Check if credentials are working
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json \
  --data-urlencode "Body=Test message" \
  --data-urlencode "From=YOUR_TWILIO_NUMBER" \
  --data-urlencode "To=YOUR_PHONE_NUMBER" \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN
```

### Step 2: Check Supabase Logs
If using Supabase hosted instance:
1. Go to Supabase Dashboard
2. Navigate to: **Logs** → **Auth Logs**
3. Look for recent SMS attempts
4. Check for any error messages

### Step 3: Test with Verified Number
1. Verify your phone number in Twilio Console
2. Try sending SMS to the verified number
3. If this works, the issue is trial account restrictions

## Solutions by Account Type

### Trial Account
**Limitations:**
- Can only send to verified numbers
- Limited number of messages
- May have geographic restrictions

**Solutions:**
1. Verify destination numbers in Twilio Console
2. Upgrade to paid account for unrestricted sending

### Paid Account
**If still having issues:**
1. Check Twilio logs for specific error codes
2. Verify sender number is properly configured
3. Consider using a Messaging Service
4. Check carrier-specific restrictions
5. Ensure compliance with local regulations

## Production Recommendations

For production use:

1. **Upgrade to Paid Twilio Account**
   - Removes verification requirements
   - Better delivery rates
   - Access to advanced features

2. **Use Twilio Messaging Service**
   - Better delivery rates
   - Automatic failover
   - Sender pool management
   - Compliance features

3. **Register Your Sender**
   - Required in many countries
   - Improves delivery rates
   - Reduces spam filtering

4. **Monitor Delivery Rates**
   - Set up alerts for failed messages
   - Track delivery metrics
   - Investigate patterns in failures

## Still Not Working?

If you've tried everything above:

1. **Check Twilio Status Page**: https://status.twilio.com/
2. **Contact Twilio Support**: They can check carrier-specific issues
3. **Try Alternative Provider**: Consider Telnyx, Vonage, or AWS SNS
4. **Check Phone Settings**: Ensure SMS isn't blocked on the device

## Additional Resources

- [Twilio SMS Best Practices](https://www.twilio.com/docs/sms/best-practices)
- [Twilio Error Codes](https://www.twilio.com/docs/api/errors)
- [SMS Delivery Issues](https://support.twilio.com/hc/en-us/articles/223181468-Troubleshooting-Undelivered-Twilio-SMS-Messages)
- [International SMS Guidelines](https://www.twilio.com/guidelines/sms)