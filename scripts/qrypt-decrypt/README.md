# @profullstack/qrypt-decrypt

CLI tool to decrypt QryptChat encrypted key files.

## Installation

```bash
npm install -g @profullstack/qrypt-decrypt
```

## Usage

```bash
qrypt-decrypt your-key-file.json
```

The tool will prompt you for the password used to encrypt the keys.

## Requirements

- Node.js v20 or newer
- A QryptChat key export file (.json)
- The password used to export the keys

## Example

```bash
$ qrypt-decrypt qryptchat-pq-keys-2025-01-20T12-30-45-123Z.json
🔐 QryptChat Key Decryption Tool v1.0.0

🔑 Enter password: [hidden]
🔓 Decrypting keys...

✅ Keys decrypted successfully!

📊 Key Information:
   Version: 2.0
   Exported: 2025-01-20T12:30:45.123Z

🔐 ML-KEM-1024 Keys:
   Algorithm: ML-KEM-1024
   Public Key: iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAA...
   Private Key: [PROTECTED - 4216 characters]

⚠️  Keep your private keys secure and never share them!
```

## Security

This tool uses the same AES-GCM-256 decryption method as the QryptChat web interface. It only decrypts and displays key information - it does not store or transmit any data.

## License

MIT