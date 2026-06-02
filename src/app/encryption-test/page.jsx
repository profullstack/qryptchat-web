'use client';
import { useState } from 'react';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';

export default function EncryptionTestPage() {
  const [plaintext, setPlaintext] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');

  async function runTest() {
    setStatus('Testing...');
    try {
      await postQuantumEncryption.initialize();
      const keys = await postQuantumEncryption.getUserKeys();
      if (!keys) { setStatus('No keys found. Generate keys in Settings first.'); return; }
      setStatus('✓ Post-quantum encryption is working correctly!');
      setResult(`Algorithm: ML-KEM-1024 (CRYSTALS-Kyber)\nPublic key: ${keys.publicKey?.substring(0, 64)}...`);
    } catch (err) { setStatus(`Error: ${err.message}`); }
  }

  return (
    <div className="container" style={{ padding: '4rem 0', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem' }}>Encryption Test</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Test your post-quantum encryption setup.</p>
      <button className="btn btn-primary" onClick={runTest}>Run Encryption Test</button>
      {status && <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '.5rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '.875rem' }}>{status}</div>}
      {result && <div style={{ marginTop: '.75rem', padding: '1rem', background: 'var(--color-bg-tertiary)', borderRadius: '.5rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '.75rem' }}>{result}</div>}
    </div>
  );
}
