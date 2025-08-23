#!/usr/bin/env bash
# Configure Supabase Auth SMTP settings via Management API (Mailgun)
# Loads .env first so SUPABASE_ACCESS_TOKEN and PROJECT_REF can be set there.
# Usage:
#   chmod +x scripts/supabase-email.sh
#   ./scripts/supabase-email.sh
#
# You can override any SMTP_* variable below via environment or .env.

set -euo pipefail

# Load .env if present (export variables so curl can see them)
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
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

# Mailgun SMTP (provided via env or .env). No secrets defaulted here.
# Ports supported by Mailgun: 25, 587, 2525, 465 (SSL/TLS). 587 recommended.
SMTP_HOST="${SMTP_HOST:-smtp.mailgun.org}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"            # Full email address as username, e.g. admin@mg.example.com
SMTP_PASS="${SMTP_PASS:-}"            # SMTP password from provider
SMTP_ADMIN_EMAIL="${SMTP_ADMIN_EMAIL:-${SMTP_USER}}"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-FirstPayingUser}"

# Validate required SMTP secrets
if [ -z "${SMTP_USER}" ] || [ -z "${SMTP_PASS}" ]; then
  echo "Error: SMTP_USER and SMTP_PASS must be set in .env (or environment)." >&2
  exit 1
fi
if [ -z "${SMTP_ADMIN_EMAIL}" ]; then
  echo "Error: SMTP_ADMIN_EMAIL must be set or defaultable from SMTP_USER." >&2
  exit 1
fi

# Email confirmation settings
ENABLE_EMAIL_CONFIRMATIONS="${ENABLE_EMAIL_CONFIRMATIONS:-true}"
SITE_URL="${SITE_URL:-https://firstpayinguser.com}"

# Build JSON payload (simple expansion; ensure your secrets contain no unescaped quotes)
read -r -d '' JSON_PAYLOAD <<EOF || true
{
  "external_email_enabled": true,
  "mailer_secure_email_change_enabled": true,
  "mailer_autoconfirm": false,
  "enable_confirmations": ${ENABLE_EMAIL_CONFIRMATIONS},
  "site_url": "${SITE_URL}",
  "smtp_admin_email": "${SMTP_ADMIN_EMAIL}",
  "smtp_host": "${SMTP_HOST}",
  "smtp_port": "${SMTP_PORT}",
  "smtp_user": "${SMTP_USER}",
  "smtp_pass": "${SMTP_PASS}",
  "smtp_sender_name": "${SMTP_SENDER_NAME}"
}
EOF

echo "Configuring SMTP for Supabase project: ${PROJECT_REF}"
echo "SMTP host: ${SMTP_HOST}, port: ${SMTP_PORT}, user: ${SMTP_USER}"
echo "Email confirmations enabled: ${ENABLE_EMAIL_CONFIRMATIONS}"
echo "Site URL: ${SITE_URL}"
echo

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}"

echo
echo "Done. If there are errors, verify your SUPABASE_ACCESS_TOKEN scope and PROJECT_REF."