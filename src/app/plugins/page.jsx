'use client';
import { useState, useEffect } from 'react';

export default function PluginsPage() {
  const [plugins, setPlugins] = useState([]);
  useEffect(() => {
    fetch('/api/plugins', { credentials: 'include' }).then(r => r.json()).then(d => setPlugins(d.plugins || [])).catch(() => {});
  }, []);
  return (
    <div className="container" style={{ padding: '4rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem' }}>Plugins</h1>
      {plugins.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No plugins installed.</p> : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {plugins.map(p => <div key={p.id} style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '.5rem', border: '1px solid var(--color-border-primary)' }}><strong>{p.name}</strong><p style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem', marginTop: '.25rem' }}>{p.description}</p></div>)}
        </div>
      )}
    </div>
  );
}
