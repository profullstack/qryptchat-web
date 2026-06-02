'use client';

import { useState, useRef } from 'react';

export default function AvatarUpload({ userId, currentAvatarUrl, size = 'medium', disabled, previewOnly, onUploaded, onError, onRemoved }) {
  const [preview, setPreview] = useState(currentAvatarUrl || null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const sizeMap = { small: 64, medium: 96, large: 128 };
  const px = sizeMap[size] || 96;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    if (previewOnly) {
      onUploaded?.({ detail: { file, avatarUrl: url } });
    } else {
      uploadFile(file);
    }
  }

  async function uploadFile(file) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/auth/upload-avatar', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.avatarUrl) {
        setPreview(data.avatarUrl);
        onUploaded?.({ detail: { file, avatarUrl: data.avatarUrl } });
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      onError?.({ detail: { message: err.message } });
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemoved?.();
  }

  return (
    <div className="avatar-upload" style={{ width: px, height: px }}>
      <div className="avatar-preview" style={{ width: px, height: px }}>
        {preview ? (
          <img src={preview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        ) : (
          <div className="avatar-placeholder" style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>👤</div>
        )}
        {uploading && <div className="avatar-overlay">...</div>}
      </div>
      {!disabled && (
        <div className="avatar-actions">
          <button type="button" className="avatar-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>📷</button>
          {preview && <button type="button" className="avatar-btn remove" onClick={handleRemove} disabled={uploading}>✕</button>}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      <style>{`
        .avatar-upload { position: relative; display: inline-block; }
        .avatar-preview { position: relative; border-radius: 50%; overflow: hidden; }
        .avatar-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; color: white; border-radius: 50%; }
        .avatar-actions { position: absolute; bottom: -4px; right: -4px; display: flex; gap: 2px; }
        .avatar-btn { width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; background: var(--color-brand-primary); color: white; font-size: .75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .avatar-btn.remove { background: var(--color-error); }
      `}</style>
    </div>
  );
}
