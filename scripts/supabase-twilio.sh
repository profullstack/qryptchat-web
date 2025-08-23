#!/usr/bin/env bash
# Configure Supabase Auth SMS settings via Management API (Twilio)
# Loads .env first so SUPABASE_ACCESS_TOKEN and PROJECT_REF can be set there.
# Usage:
#   chmod +x scripts/supabase-twilio.sh
#   ./scripts/supabase-twilio.sh
#
# You can override any TWILIO_* variable below via environment or .env.

set -euo pipefail

# Load .env if present (export variables so curl can see them)
# Filter out comments and invalid bash syntax
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  # Only source lines that look like valid environment variables
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    # Only process lines that look like KEY=VALUE
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      eval "export $line" 2>/dev/null || true
    fi
  done < .env
  set +a
fi

# Required: Supabase Management API token and project ref
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
PROJECT_REF="${PROJECT_REF:-}"

if [ -z "${SUPABASE_ACCESS_TOKEN}" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN is not set. Get one at https://supabase.com/dashboard/account/tokens and set it in your environment or .env" >&2
  exit 1
fi

if [ -z "${PROJECT_REF}" ]; then
  echo "Error: PROJECT_REF is not set. Example: fmgvmvznxwsagonkiarc. Set it in your environment or .env" >&2
  exit 1
fi

# Twilio SMS settings (provided via env or .env). No secrets defaulted here.
TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
TWILIO_PHONE_NUMBER="${TWILIO_PHONE_NUMBER:-}"  # Format: +1234567890
TWILIO_MESSAGE_SERVICE_SID="${TWILIO_MESSAGE_SERVICE_SID:-}"  # Optional: Use Message Service instead of phone number

# Validate required Twilio secrets
if [ -z "${TWILIO_ACCOUNT_SID}" ] || [ -z "${TWILIO_AUTH_TOKEN}" ]; then
  echo "Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env (or environment)." >&2
  echo "Get these from your Twilio Console at https://console.twilio.com/" >&2
  exit 1
fi

if [ -z "${TWILIO_PHONE_NUMBER}" ] && [ -z "${TWILIO_MESSAGE_SERVICE_SID}" ]; then
  echo "Error: Either TWILIO_PHONE_NUMBER or TWILIO_MESSAGE_SERVICE_SID must be set in .env (or environment)." >&2
  echo "TWILIO_PHONE_NUMBER format: +1234567890" >&2
  echo "TWILIO_MESSAGE_SERVICE_SID format: MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" >&2
  exit 1
fi

# SMS authentication settings
ENABLE_PHONE_CONFIRMATIONS="${ENABLE_PHONE_CONFIRMATIONS:-true}"
ENABLE_PHONE_CHANGE_CONFIRMATIONS="${ENABLE_PHONE_CHANGE_CONFIRMATIONS:-true}"
SMS_TEMPLATE="${SMS_TEMPLATE:-Your code is {{ .Code }}}"
SITE_URL="${SITE_URL:-https://qrypto.chat}"
# OTP expiration time in seconds (default: 300 = 5 minutes, max: 3600 = 1 hour)
SMS_OTP_EXP="${SMS_OTP_EXP:-300}"

# Build JSON payload for Supabase SMS auth configuration
# Use Message Service SID if provided, otherwise use phone number
MESSAGE_SERVICE_SID_VALUE="${TWILIO_MESSAGE_SERVICE_SID:-}"
read -r -d '' JSON_PAYLOAD <<EOF || true
{
  "external_phone_enabled": true,
  "sms_provider": "twilio",
  "sms_twilio_account_sid": "${TWILIO_ACCOUNT_SID}",
  "sms_twilio_auth_token": "${TWILIO_AUTH_TOKEN}",
  "sms_twilio_message_service_sid": "${MESSAGE_SERVICE_SID_VALUE}",
  "enable_phone_confirmations": ${ENABLE_PHONE_CONFIRMATIONS},
  "enable_phone_change_confirmations": ${ENABLE_PHONE_CHANGE_CONFIRMATIONS},
  "sms_template": "${SMS_TEMPLATE}",
  "sms_otp_exp": ${SMS_OTP_EXP},
  "site_url": "${SITE_URL}"
}
EOF

echo "Configuring Twilio SMS for Supabase project: ${PROJECT_REF}"
echo "Twilio Account SID: ${TWILIO_ACCOUNT_SID}"
echo "Twilio Phone Number: ${TWILIO_PHONE_NUMBER}"
echo "Phone confirmations enabled: ${ENABLE_PHONE_CONFIRMATIONS}"
echo "Phone change confirmations enabled: ${ENABLE_PHONE_CHANGE_CONFIRMATIONS}"
echo "SMS template: ${SMS_TEMPLATE}"
echo "SMS OTP expiration: ${SMS_OTP_EXP} seconds"
echo "Site URL: ${SITE_URL}"
echo

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}"

echo
echo "Done. If there are errors, verify your SUPABASE_ACCESS_TOKEN scope and PROJECT_REF."
echo "You can now use Supabase's built-in SMS auth with signInWithOtp() and phone numbers."
