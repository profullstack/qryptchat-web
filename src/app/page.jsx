'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/hooks/useI18n.js';

export default function HomePage() {
  const { t } = useI18n();

  return (
    <>
      <div className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">{t('app.name')}</h1>
              <p className="hero-tagline">{t('app.tagline')}</p>
              <p className="hero-description">{t('app.description')}</p>
              <div className="hero-actions">
                <Link href="/auth" className="btn btn-primary">{t('nav.register')}</Link>
                <Link href="/auth" className="btn btn-secondary">{t('nav.login')}</Link>
              </div>
            </div>
            <div className="hero-visual">
              <img src="/hero.svg" alt="QryptChat Hero" className="hero-image" />
            </div>
          </div>
        </div>
      </div>

      <section className="features">
        <div className="container">
          <div className="section-header">
            <h2>Why Choose QryptChat?</h2>
            <p>Built for the future of secure communication</p>
          </div>
          <div className="features-grid">
            {[
              { num: '01', title: 'Post-Quantum Cryptography', desc: 'Uses ML-KEM-1024 (CRYSTALS-Kyber) and CRYSTALS-Dilithium algorithms approved by NIST for quantum resistance.' },
              { num: '02', title: 'Phone Number Authentication', desc: 'Simple and secure registration using your phone number with SMS verification.' },
              { num: '03', title: '🔐 Encrypted Voice & Video Calls', desc: 'Crystal-clear 1:1 and group calls protected with ML-KEM-1024 post-quantum encryption.' },
              { num: '04', title: 'Real-time Messaging', desc: 'Instant message delivery with typing indicators and read receipts.' },
              { num: '05', title: 'Multi-language Support', desc: 'Available in multiple languages with full internationalization support.' },
            ].map(({ num, title, desc }) => (
              <div key={num} className="feature-item">
                <div className="feature-number">{num}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .hero {
          background: linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-secondary) 100%);
          color: white;
          padding: var(--space-20) 0;
          min-height: 80vh;
          display: flex;
          align-items: center;
        }
        .hero-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-16);
          align-items: center;
        }
        .hero-title {
          font-size: 3.5rem;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: var(--space-4);
          background: linear-gradient(45deg, #ffffff, #e2e8f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-tagline { font-size: 1.5rem; font-weight: 600; margin-bottom: var(--space-4); opacity: 0.9; }
        .hero-description { font-size: 1.125rem; line-height: 1.7; margin-bottom: var(--space-8); opacity: 0.8; }
        .hero-actions { display: flex; gap: var(--space-4); }
        .hero-actions .btn { padding: var(--space-4) var(--space-8); font-size: 1.125rem; font-weight: 600; }
        .hero-actions .btn-primary { background-color: white; color: var(--color-brand-primary); border-color: white; }
        .hero-actions .btn-primary:hover { background-color: var(--color-bg-secondary); transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,.2); }
        .hero-actions .btn-secondary { background-color: transparent; color: white; border-color: rgba(255,255,255,.3); }
        .hero-actions .btn-secondary:hover { background-color: rgba(255,255,255,.1); border-color: white; }
        .hero-image { width: 100%; height: auto; max-width: 500px; opacity: 0.9; filter: drop-shadow(0 10px 30px rgba(0,0,0,.3)); }
        .features { padding: var(--space-20) 0; background-color: var(--color-bg-secondary); }
        .section-header { text-align: center; margin-bottom: var(--space-16); }
        .section-header h2 { font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: var(--space-4); }
        .section-header p { font-size: 1.25rem; color: var(--color-text-secondary); }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-8); }
        .feature-item { background-color: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: var(--radius-xl); padding: var(--space-8); transition: transform .3s ease, box-shadow .3s ease; }
        .feature-item:hover { transform: translateY(-5px); box-shadow: var(--shadow-xl); }
        .feature-number { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary)); color: white; border-radius: var(--radius-xl); font-weight: 700; font-size: 1.125rem; margin-bottom: var(--space-4); }
        .feature-item h3 { font-size: 1.5rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: var(--space-3); }
        .feature-item p { color: var(--color-text-secondary); line-height: 1.6; }
        @media (max-width: 768px) {
          .hero { padding: var(--space-16) 0; min-height: 70vh; }
          .hero-content { grid-template-columns: 1fr; gap: var(--space-12); text-align: center; }
          .hero-title { font-size: 2.5rem; }
          .hero-actions { justify-content: center; }
          .features-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
