'use client';

import { useState, useEffect } from 'react';
import { decryptFileContent } from '@/lib/utils/file-decryption.js';

function base64ToBlobUrl(base64, mimeType) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/octet-stream' }));
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function kind(mimeType, filename) {
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  // fall back to extension sniffing
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  return 'file';
}

export default function MessageAttachments({ messageId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!messageId) return undefined;
    let cancelled = false;
    const createdUrls = [];

    (async () => {
      try {
        const res = await fetch(`/api/files/message/${messageId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load attachments');
        const { files } = await res.json();
        const out = [];
        for (const f of files || []) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const { content, filename, metadata } = await decryptFileContent(f.id);
            const mimeType = metadata?.mimeType || '';
            const url = base64ToBlobUrl(content, mimeType);
            createdUrls.push(url);
            out.push({ id: f.id, filename, mimeType, size: metadata?.size, url, kind: kind(mimeType, filename) });
          } catch (e) {
            out.push({ id: f.id, filename: 'Encrypted file', error: e?.message || 'Failed to decrypt' });
          }
        }
        if (!cancelled) setItems(out);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load attachments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [messageId]);

  if (loading) {
    return <div className="att-loading"><span className="att-spinner" /> Decrypting attachment…</div>;
  }
  if (error) {
    return <div className="att-error">⚠ {error}</div>;
  }
  if (items.length === 0) return null;

  return (
    <div className="att-list">
      {items.map((it) => (
        <div key={it.id} className="att-item">
          {it.error ? (
            <div className="att-error">⚠ {it.filename}: {it.error}</div>
          ) : it.kind === 'image' ? (
            <a href={it.url} target="_blank" rel="noopener noreferrer">
              <img className="att-image" src={it.url} alt={it.filename} />
            </a>
          ) : it.kind === 'video' ? (
            <video className="att-video" src={it.url} controls preload="metadata" />
          ) : it.kind === 'audio' ? (
            <audio className="att-audio" src={it.url} controls preload="metadata" />
          ) : (
            <a className="att-file" href={it.url} download={it.filename}>
              <span className="att-file-icon">📎</span>
              <span className="att-file-name" title={it.filename}>{it.filename}</span>
              {it.size ? <span className="att-file-size">{formatFileSize(it.size)}</span> : null}
            </a>
          )}
        </div>
      ))}

      <style>{`
        .att-list { display: flex; flex-direction: column; gap: .375rem; margin-top: .375rem; }
        .att-loading, .att-error { font-size: .8125rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: .4rem; }
        .att-error { color: var(--color-error); }
        .att-spinner { width: 13px; height: 13px; border: 2px solid rgba(127,127,127,.3); border-top-color: var(--color-brand-primary); border-radius: 50%; animation: spin .8s linear infinite; }
        .att-image { max-width: 260px; max-height: 320px; border-radius: .5rem; display: block; cursor: pointer; }
        .att-video { max-width: 280px; max-height: 320px; border-radius: .5rem; display: block; background: #000; }
        .att-audio { width: 240px; }
        .att-file { display: flex; align-items: center; gap: .4rem; padding: .5rem .625rem; background: var(--color-bg-tertiary); border: 1px solid var(--color-border-primary); border-radius: .5rem; text-decoration: none; color: var(--color-text-primary); max-width: 260px; }
        .att-file:hover { background: var(--color-bg-secondary); }
        .att-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8125rem; }
        .att-file-size { flex-shrink: 0; color: var(--color-text-muted); font-size: .75rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
