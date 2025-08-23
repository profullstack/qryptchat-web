# 🔐 QryptChat

**Quantum-Resistant End-to-End Encrypted Messaging**

A secure, privacy-focused chat application built with post-quantum cryptography to protect against both classical and quantum computer attacks.

## ✨ Features

### 🛡️ Quantum-Resistant Security
- **CRYSTALS-Kyber** key encapsulation for quantum-safe key exchange
- **CRYSTALS-Dilithium** digital signatures for message authentication
- **ChaCha20-Poly1305** for fast symmetric encryption
- **Perfect Forward Secrecy** with automatic key rotation

### 📱 Progressive Web App
- **Cross-Platform**: Works on iOS, Android, Desktop, and Web
- **Offline Support**: Send messages even without internet
- **Push Notifications**: Never miss a message
- **Install Anywhere**: Add to home screen on any device

### 🚀 Real-Time Communication
- **Native WebSockets** for instant message delivery
- **Typing Indicators** to see when others are typing
- **Online Presence** to know who's available
- **Message Status** with delivery and read receipts

### 👥 Social Features
- **Phone Verification** via Twilio SMS for secure onboarding
- **Contact Discovery** find friends using phone numbers
- **Group Chats** up to 100 participants with admin controls
- **Media Sharing** with end-to-end encrypted file transfers

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit 5 + Svelte 5 | Reactive UI framework |
| **Styling** | Vanilla CSS | Custom design system |
| **Database** | Supabase PostgreSQL | User data and messages |
| **Real-time** | Supabase Realtime | Live message delivery |
| **Auth** | Supabase Auth + Twilio | Phone-based verification |
| **Crypto** | CRYSTALS-Kyber/Dilithium | Post-quantum cryptography |
| **PWA** | Service Worker + Manifest | Offline-first experience |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- pnpm (recommended) or npm
- Supabase account
- Twilio account (for SMS)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/qryptchat.git
cd qryptchat

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and Twilio credentials

# Start development server
pnpm dev
```

### Environment Variables

```env
# Supabase
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# App
PUBLIC_APP_URL=http://localhost:5173
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

- [x] 🔐 Post-quantum cryptography implementation
- [x] 📱 Progressive Web App foundation
- [x] 🔄 Real-time messaging with WebSockets
- [ ] 👥 Group chat functionality
- [ ] 📁 File sharing with encryption
- [ ] 🎥 Voice and video calls
- [ ] 🌐 Multi-language support
- [ ] 🔍 Message search
- [ ] 🎨 Custom themes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for a quantum-safe future**
