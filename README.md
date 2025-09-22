# 🔐 QryptChat

**Quantum-Resistant End-to-End Encrypted Messaging**

A secure, privacy-focused chat application built with post-quantum cryptography to protect against both classical and quantum computer attacks.

## ✨ Features

### 🛡️ Quantum-Resistant Security
- **Post-Quantum Cryptography** ready for quantum-safe communication
- **End-to-End Encryption** with client-side key management
- **Perfect Forward Secrecy** with automatic key rotation
- **Zero-Knowledge Architecture** - your data stays private

### 📱 Progressive Web App
- **Cross-Platform**: Works on iOS, Android, Desktop, and Web
- **Offline Support**: Send messages even without internet
- **Push Notifications**: Never miss a message
- **Install Anywhere**: Add to home screen on any device

### 🚀 Real-Time Communication & Sync
- **Instant Messaging** with WebSocket real-time delivery
- **Cross-Device Sync** - seamless experience across all devices
- **Multi-Session Support** - stay logged in on multiple devices
- **Typing Indicators** to see when others are typing
- **Online Presence** to know who's available
- **Message Status** with delivery and read receipts

### 👥 Social Features
- **Phone Verification** via Twilio SMS for secure onboarding
- **Contact Discovery** find friends using phone numbers
- **Group Chats** up to 100 participants with admin controls
- **Media Sharing** with end-to-end encrypted file transfers

### 🌍 Accessibility & Internationalization
- **Multi-Language Support** - 6 languages (EN, ES, FR, DE, AR, ZH)
- **RTL Support** for Arabic and other right-to-left languages
- **Dark/Light Themes** with system preference detection
- **Responsive Design** optimized for all screen sizes

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit 5 + Svelte 5 | Reactive UI framework |
| **Styling** | Vanilla CSS + Custom Properties | Modern design system |
| **Database** | Supabase PostgreSQL | User data and messages |
| **Real-time** | Supabase Realtime | Live message delivery & sync |
| **Auth** | Custom SMS + Supabase | Phone-based verification |
| **SMS** | Twilio | SMS verification service |
| **Crypto** | Post-Quantum Ready | Future-proof encryption |
| **PWA** | Vite PWA Plugin | Offline-first experience |
| **I18n** | Custom Store | Multi-language support |

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

## 🔒 Security Model

QryptChat implements a **zero-knowledge architecture** where:

- 🔐 **All encryption happens client-side** before data leaves your device
- 🗝️ **Private keys never leave your device** and are stored encrypted
- 🔄 **Perfect forward secrecy** ensures past messages stay secure
- 🛡️ **Quantum-resistant algorithms** protect against future quantum computers
- 🕵️ **Metadata protection** minimizes information leakage

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

### ✅ Completed (v0.1.0)
- [x] 🏗️ **Core Infrastructure** - SvelteKit + Vite + PWA setup
- [x] 🎨 **Modern UI/UX** - Responsive design with dark/light themes
- [x] 🌍 **Internationalization** - 6 languages with RTL support
- [x] 📱 **Progressive Web App** - Offline-first with service worker
- [x] 🔐 **Authentication System** - Phone-based SMS verification
- [x] 🗄️ **Database Schema** - Complete Supabase setup with RLS
- [x] 🔄 **Real-time Foundation** - WebSocket infrastructure ready

### 🚧 In Progress (v0.2.0)
- [ ] 💬 **Core Messaging** - Send/receive messages with encryption
- [ ] 🔄 **Cross-Device Sync** - Real-time synchronization across devices
- [ ] 👥 **Contact System** - Add and manage contacts
- [ ] 📊 **Presence System** - Online/offline status indicators

### 🎯 Upcoming (v0.3.0+)
- [ ] 👥 **Group Chats** - Multi-user conversations
- [ ] 📁 **File Sharing** - Encrypted media and document sharing
- [ ] 🔍 **Message Search** - Full-text search across conversations
- [ ] 🔔 **Push Notifications** - Cross-platform notification system
- [ ] 🎥 **Voice & Video** - End-to-end encrypted calls
- [ ] 🔐 **Advanced Encryption** - Post-quantum cryptography implementation

### 🔮 Future Vision
- [ ] 🤖 **AI Integration** - Smart message suggestions and translation
- [ ] 🌐 **Federation** - Connect with other secure messaging platforms
- [ ] 📈 **Analytics** - Privacy-preserving usage insights
- [ ] 🎨 **Customization** - Custom themes and chat backgrounds

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


---

**Built with ❤️ for a quantum-safe future**
