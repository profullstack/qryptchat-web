# SMS Configuration Fix Guide

## Problem Identified

**Error:** `Error sending confirmation OTP to provider: Authenticate` (Twilio Error 20003)

**Root Cause:** Your production Supabase instance at `https://xydzwxwsbgmznthiiscl.supabase.co` does not have valid Twilio credentials configured, or the credentials are incorrect/expired.

## Solution: Configure Twilio in Supabase Dashboard

### Step 1: Get Your Twilio Credentials

1. Go to [Twilio Console](https://console.twilio.com/)
2. From the dashboard, copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click to reveal)
3. Get your Twilio phone number:
   - Go to Phone Numbers → Manage → Active Numbers
   - Copy your phone number in E.164 format (e.g., `+14155551234`)

### Step 2: Configure Twilio in Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/xydzwxwsbgmznthiiscl
2. Navigate to: **Authentication** → **Providers** → **Phone**
3. Enable Phone authentication if not already enabled
4. Scroll down to **SMS Provider Settings**
5. Select **Twilio** as your SMS provider
6. Enter your credentials:
   - **Twilio Account SID**: Your Account SID from Step 1
   - **Twilio Auth Token**: Your Auth Token from Step 1
   - **Twilio Phone Number**: Your phone number in E.164 format (e.g., `+14155551234`)
7. Click **Save**

### Step 3: Verify Configuration

After saving, test the SMS functionality:

1. Try logging in with a phone number
2. You should receive an SMS with a verification code
3. Check the application logs for any errors

### Step 4: Troubleshooting

If SMS still doesn't work after configuration:

#### Check Twilio Account Status
- Ensure your Twilio account is active and not suspended
- Verify you have sufficient credits/balance
- Check if your account is still in trial mode (trial accounts have restrictions)

#### Verify Phone Number
- Trial Twilio accounts can only send to verified phone numbers
- To send to any number, upgrade to a paid Twilio account
- Verify the recipient's phone number in Twilio Console if using trial

#### Check Twilio Logs
1. Go to Twilio Console → Monitor → Logs → Errors
2. Look for recent SMS errors
3. Common issues:
   - Invalid phone number format
   - Unverified destination (trial accounts)
   - Insufficient balance
   - Geographic restrictions

#### Test Twilio Credentials Directly

Run this diagnostic script to test your Twilio credentials:

```bash
node tests/sms-config-diagnostic.test.js
```

Or test manually with curl:

```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json \
  --data-urlencode "Body=Test message" \
  --data-urlencode "From=YOUR_TWILIO_NUMBER" \
  --data-urlencode "To=+1XXXXXXXXXX" \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN
```

### Step 5: Alternative - Use Twilio Messaging Service (Recommended)

For better reliability and features:

1. In Twilio Console, create a Messaging Service:
   - Go to Messaging → Services → Create new Messaging Service
   - Add your phone number to the service
   - Copy the Messaging Service SID (starts with `MG...`)

2. In Supabase Dashboard:
   - Instead of entering a phone number, enter the Messaging Service SID
   - This provides better delivery rates and features

## Environment Variables (For Local Development Only)

For local Supabase development, add these to your `.env` file:

```env
# Twilio Configuration (for local Supabase only)
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
# Optional: Use Messaging Service instead of phone number
TWILIO_MESSAGE_SERVICE_SID=your_messaging_service_sid_here
```

**Note:** These environment variables are ONLY for local development. Production uses the Supabase Dashboard configuration.

## Quick Checklist

- [ ] Twilio account is active and funded
- [ ] Account SID and Auth Token are correct
- [ ] Phone number is in E.164 format (+1XXXXXXXXXX)
- [ ] If trial account, destination number is verified
- [ ] Configuration saved in Supabase Dashboard
- [ ] Tested SMS sending after configuration
- [ ] Checked Twilio logs for any errors

## Additional Resources

- [Supabase Phone Auth Documentation](https://supabase.com/docs/guides/auth/phone-login)
- [Twilio Error 20003 Documentation](https://www.twilio.com/docs/errors/20003)
- [Twilio Console](https://console.twilio.com/)
- [Supabase Dashboard](https://supabase.com/dashboard)

## Support

If you continue to experience issues:
1. Check Twilio account status and balance
2. Verify credentials are entered correctly in Supabase Dashboard
3. Review Twilio error logs
4. Contact Twilio support if credentials are correct but still failing