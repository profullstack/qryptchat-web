# 🔐 QryptChat

**Quantum-Resistant End-to-End Encrypted Messaging**

A secure, privacy-focused chat application built with post-quantum cryptography to protect against both classical and quantum computer attacks.

## ✨ Features

### 🛡️ Quantum-Resistant Security
- **ML-KEM-1024 Post-Quantum Cryptography** - FIPS 203 compliant quantum-safe encryption
- **ChaCha20-Poly1305 Symmetric Encryption** - Fast, secure message encryption
- **End-to-End Encryption** with client-side key management and zero server access
- **Perfect Forward Secrecy** with automatic key rotation and secure key derivation
- **Zero-Knowledge Architecture** - your private keys never leave your device
- **Private Key Import/Export** - Secure backup with password and GPG protection

### 📱 Progressive Web App
- **Cross-Platform**: Works on iOS, Android, Desktop, and Web browsers
- **Offline Support**: Queue messages when offline, sync when reconnected
- **Desktop Integration**: Install as native app with system shortcuts
- **Mobile Optimized**: Touch-friendly interface with gesture support
- **Service Worker**: Background sync and caching for optimal performance

### 🚀 Real-Time Communication & Sync
- **WebSocket Real-Time** - Instant message delivery and status updates
- **Cross-Device Sync** - Seamless experience across all logged-in devices
- **Multi-Session Support** - Stay connected on multiple devices simultaneously
- **Live Typing Indicators** - See when others are composing messages
- **Online Presence System** - Real-time availability status
- **Message Delivery Status** - Sent, delivered, and read receipts
- **Auto-Reconnection** - Robust connection handling with automatic retry

### 👥 Social & Communication Features
- **SMS Phone Verification** - Secure onboarding via Twilio integration
- **Contact Discovery** - Find friends using verified phone numbers
- **Encrypted File Sharing** - Share photos, videos, and documents securely
- **Enhanced Video Player** - In-app video playback with diagnostic tools
- **Message Archiving** - Archive and restore conversation history
- **Disappearing Messages** - Auto-delete messages after specified time periods
- **Voice & Video Calls** - End-to-end encrypted calls with ML-KEM key exchange

### 🌍 Accessibility & Internationalization
- **Multi-Language Support** - 6 languages (EN, ES, FR, DE, AR, ZH) with easy switching
- **RTL Support** - Full right-to-left language support for Arabic and Hebrew
- **Dark/Light Themes** - System preference detection with manual override
- **Responsive Design** - Optimized for all screen sizes from mobile to desktop
- **Keyboard Navigation** - Full accessibility support for screen readers

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit 5 + Svelte 5 | Reactive UI framework with runes |
| **Styling** | Vanilla CSS + Custom Properties | Modern design system with themes |
| **Database** | Supabase PostgreSQL | User data, messages, and file storage |
| **Real-time** | Custom WebSocket + Supabase Realtime | Live message delivery & presence |
| **Auth** | Custom SMS + Supabase Auth | Phone-based verification system |
| **SMS** | Twilio | SMS verification and notifications |
| **Crypto** | ML-KEM-1024 + ChaCha20-Poly1305 | Post-quantum encryption (FIPS 203) |
| **Key Exchange** | ML-KEM (Kyber) + Dilithium | Quantum-resistant key management |
| **File Encryption** | Multi-recipient PQ encryption | Secure file sharing with metadata |
| **PWA** | Vite PWA Plugin + Service Worker | Offline-first with background sync |
| **I18n** | Custom Svelte Store | Multi-language with RTL support |
| **WebRTC** | Native WebRTC + ML-KEM | Encrypted voice/video calls |
| **Testing** | Vitest + Custom Test Suite | Comprehensive crypto and integration tests |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (recommended)
- pnpm (recommended) or npm
- Supabase account
- Twilio account (for SMS verification)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/qryptchat.git
cd qryptchat

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase and Twilio credentials

# Run Supabase migrations (if using local Supabase)
pnpx supabase db reset

# Start development server
pnpm dev
```

The app will be available at `http://localhost:8080` (or the PORT specified in your .env file).

### Environment Variables

```env
# Development
PORT=8080

# Supabase
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twilio (for SMS verification)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# App
PUBLIC_APP_URL=http://localhost:8080
```

### Using Production API in Local Development

If you want to run the frontend locally while connecting to your production Supabase instance (useful for testing or development without setting up a local database), follow these steps:

#### 1. Get Production Credentials

From your Supabase project dashboard:
- Navigate to **Settings** → **API**
- Copy your **Project URL** (e.g., `https://xxxxx.supabase.co`)
- Copy your **anon/public key**
- Copy your **service_role key** (keep this secure!)

#### 2. Configure Environment Variables

Update your `.env` file with production values:

```env
# Point to production Supabase
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Keep local development settings
PORT=8080
PUBLIC_APP_URL=http://localhost:8080
NODE_ENV=development

# Production Twilio credentials (if testing SMS)
TWILIO_ACCOUNT_SID=your_production_twilio_sid
TWILIO_AUTH_TOKEN=your_production_twilio_token
TWILIO_PHONE_NUMBER=your_production_twilio_phone
```

#### 3. Important Considerations

⚠️ **Security Warnings:**
- Never commit production credentials to version control
- Use production credentials only in secure local environments
- Consider using a separate "staging" Supabase project for development
- Be cautious when testing features that modify production data

💡 **Best Practices:**
- Test destructive operations on a staging environment first
- Use Row Level Security (RLS) policies to protect production data
- Monitor your Supabase dashboard for unexpected activity
- Consider creating a separate test user account for development

#### 4. Verify Connection

Start your development server:

```bash
pnpm dev
```

The app should now connect to your production Supabase instance. You can verify by:
- Checking the browser console for connection logs
- Attempting to sign in with a production account
- Monitoring the Supabase dashboard for API requests

#### 5. Switching Back to Local Development

To switch back to local Supabase:

```bash
# Start local Supabase
pnpx supabase start

# Update .env with local credentials
PUBLIC_SUPABASE_URL=http://localhost:54321
PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
```

## 🔒 Security Model

QryptChat implements a **zero-knowledge post-quantum architecture** where:

- 🔐 **ML-KEM-1024 + ChaCha20-Poly1305** - FIPS 203 compliant post-quantum encryption
- 🗝️ **Private keys never leave your device** - Stored encrypted in IndexedDB
- 🔄 **Perfect forward secrecy** - Automatic key rotation with secure derivation
- 🛡️ **Quantum-resistant algorithms** - Protection against both classical and quantum attacks
- 🕵️ **Metadata protection** - Minimal server-side data with encrypted message content
- 🔑 **Multi-recipient encryption** - Each participant gets individually encrypted messages
- 💾 **Secure key backup** - Password-protected export with optional GPG encryption
- 🔍 **Key verification** - Cryptographic signatures ensure key authenticity

## 📚 Documentation

- [🏗️ Architecture Overview](./ARCHITECTURE.md)
- [🔒 Encryption Details](./ENCRYPTION.md)

## 🧪 Development

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Build for production
pnpm build

# Preview production build
pnpm preview

# Lint code
pnpm lint

# Format code
pnpm format
```

## 🛣️ Roadmap

### ✅ Completed (v1.0.0)
- [x] 🏗️ **Core Infrastructure** - SvelteKit + Vite + PWA setup
- [x] 🎨 **Modern UI/UX** - Responsive design with dark/light themes
- [x] 🌍 **Internationalization** - 6 languages with RTL support
- [x] 📱 **Progressive Web App** - Offline-first with service worker
- [x] 🔐 **Authentication System** - Phone-based SMS verification
- [x] 🗄️ **Database Schema** - Complete Supabase setup with RLS
- [x] 🔄 **Real-time Foundation** - WebSocket infrastructure ready
- [x] 💬 **Core Messaging** - Send/receive messages with post-quantum encryption
- [x] 🔄 **Cross-Device Sync** - Real-time synchronization across devices
- [x] 👥 **Contact System** - Add and manage contacts via phone numbers
- [x] 📊 **Presence System** - Online/offline status indicators
- [x] 🔐 **Post-Quantum Encryption** - ML-KEM-1024 + ChaCha20-Poly1305 implementation
- [x] 📁 **File Sharing** - Encrypted media and document sharing with video playback
- [x] 🎥 **Voice & Video** - End-to-end encrypted calls with ML-KEM key exchange
- [x] 🔑 **Key Management** - Private key import/export with password protection
- [x] 🗂️ **Message Archiving** - Archive and restore conversations
- [x] ⏰ **Disappearing Messages** - Auto-delete messages after specified time
- [x] 🔔 **Real-time Notifications** - Live message delivery and status updates

### 🚧 In Progress (v1.1.0)
- [ ] 👥 **Group Chats** - Multi-user conversations (basic implementation exists)
- [ ] 🔍 **Message Search** - Full-text search across conversations
- [ ] 🔔 **Push Notifications** - Cross-platform notification system
- [ ] 📱 **Mobile App Optimization** - Enhanced PWA features for mobile

### 🎯 Upcoming (v1.2.0+)
- [ ] 🤖 **AI Integration** - Smart message suggestions and translation
- [ ] 🌐 **Federation** - Connect with other secure messaging platforms
- [ ] 📈 **Analytics** - Privacy-preserving usage insights
- [ ] 🎨 **Customization** - Custom themes and chat backgrounds
- [ ] 🔐 **Hardware Security** - WebAuthn integration for key storage
- [ ] 📊 **Advanced Analytics** - Message delivery metrics and insights

### 🔮 Future Vision
- [ ] 🌍 **Decentralized Network** - P2P messaging without central servers
- [ ] 🛡️ **Zero-Knowledge Proofs** - Enhanced privacy verification
- [ ] 🔬 **Quantum Key Distribution** - Hardware-based quantum security
- [ ] 🤝 **Cross-Platform Protocol** - Universal secure messaging standard

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


---

**Built with ❤️ for a quantum-safe future**
