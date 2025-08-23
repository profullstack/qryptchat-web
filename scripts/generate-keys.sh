#!/bin/bash

# generate-keys.sh - Generate secure encryption key and configure JWKS discovery URL
# Usage: ./scripts/generate-keys.sh [--supabase-jwks-url <url>]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --supabase-jwks-url <url>   Set Supabase JWKS discovery URL for JWT verification"
    echo "  --help                      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --supabase-jwks-url 'https://your-project.supabase.co/auth/v1/.well-known/jwks.json'"
}

# Function to generate a 32-byte hex key
generate_hex_key() {
    openssl rand -hex 32
}

# Function to validate JWKS URL
validate_jwks_url() {
    local url=$1
    if ! curl -s --fail "$url" > /dev/null 2>&1; then
        print_error "Failed to fetch JWKS from URL: $url"
        return 1
    fi
    
    # Check if the response contains expected JWKS structure
    local response=$(curl -s "$url")
    if ! echo "$response" | grep -q '"keys"'; then
        print_error "Invalid JWKS response from URL: $url"
        return 1
    fi
    
    return 0
}

# Parse command line arguments
SUPABASE_JWKS_URL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --supabase-jwks-url)
            SUPABASE_JWKS_URL="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    print_error "openssl is required but not installed. Please install openssl first."
    exit 1
fi

# Check if curl is available (needed for JWKS validation)
if ! command -v curl &> /dev/null; then
    print_error "curl is required but not installed. Please install curl first."
    exit 1
fi

print_info "Generating secure encryption key for your application..."
echo

# Generate encryption key (32 bytes = 64 hex characters)
ENCRYPTION_KEY=$(generate_hex_key)
print_success "Generated ENCRYPTION_KEY (32 bytes, 64 hex characters)"

# Validate JWKS URL if provided
if [ -n "$SUPABASE_JWKS_URL" ]; then
    print_info "Validating Supabase JWKS URL..."
    if validate_jwks_url "$SUPABASE_JWKS_URL"; then
        print_success "JWKS URL validated successfully"
    else
        print_error "JWKS URL validation failed. Please check the URL and try again."
        exit 1
    fi
fi

echo
print_info "Generated configuration:"
echo "# Security Configuration (generated $(date))"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"

# Add Supabase JWKS URL if provided
if [ -n "$SUPABASE_JWKS_URL" ]; then
    echo ""
    echo "# Supabase JWT Configuration"
    echo "SUPABASE_JWT_DISCOVERY_URL=$SUPABASE_JWKS_URL"
fi

echo
print_warning "IMPORTANT SECURITY NOTES:"
echo "1. Keep the encryption key secret and never commit it to version control"
echo "2. Store it securely in your .env file"
echo "3. Use different keys for different environments (dev, staging, prod)"
echo "4. Rotate the encryption key periodically for enhanced security"
if [ -n "$SUPABASE_JWKS_URL" ]; then
    echo "5. The JWKS discovery URL is used for JWT verification with Supabase Auth"
    echo "6. JWT verification uses public keys from the JWKS endpoint (no secret needed)"
fi

# Check if .env file exists and offer to append
if [ -f ".env" ]; then
    echo
    read -p "Do you want to append these values to your .env file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "" >> .env
        echo "# Security Configuration (generated $(date))" >> .env
        echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
        
        if [ -n "$SUPABASE_JWKS_URL" ]; then
            echo "" >> .env
            echo "# Supabase JWT Configuration" >> .env
            echo "SUPABASE_JWT_DISCOVERY_URL=$SUPABASE_JWKS_URL" >> .env
        fi
        
        print_success "Configuration appended to .env file"
    else
        print_info "Configuration not added to .env file. Please add them manually."
    fi
else
    print_warning ".env file not found. Please create one and add these values manually."
fi

echo
print_info "Key generation completed successfully!"

# Show example usage for JWKS
if [ -n "$SUPABASE_JWKS_URL" ]; then
    echo
    print_info "Example usage in your application:"
    echo "import { createRemoteJWKSet, jwtVerify } from 'jose';"
    echo ""
    echo "// Create JWKS client"
    echo "const JWKS = createRemoteJWKSet(new URL(process.env.SUPABASE_JWT_DISCOVERY_URL));"
    echo ""
    echo "// Verify Supabase JWT token"
    echo "const verifySupabaseToken = async (token) => {"
    echo "  const { payload } = await jwtVerify(token, JWKS, {"
    echo "    issuer: 'https://your-project.supabase.co/auth/v1',"
    echo "    audience: 'authenticated'"
    echo "  });"
    echo "  return payload;"
    echo "};"
fi