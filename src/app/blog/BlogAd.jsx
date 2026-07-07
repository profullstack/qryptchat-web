'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useAuthStore } from '@/lib/stores/auth.js';

// CrawlProof banner, shown only to logged-out visitors on /blog/*. The auth
// store hydrates from localStorage on the client, so we wait for mount + the
// initial `loading` to settle before deciding, to avoid flashing an ad at a
// signed-in user. On client-side navigation ad.js may already be loaded, so we
// re-trigger its slot scan once mounted.
export default function BlogAd() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    setMounted(true);
  }, []);

  const show = mounted && !loading && !user;

  useEffect(() => {
    if (show && typeof window !== 'undefined') {
      window.crawlproofAds?.scan?.();
    }
  }, [show]);

  if (!show) return null;

  return (
    <>
      <div className="container" style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
        <div data-cp-ad data-slot="4a5b5f93-ebd9-4d02-b927-05544fdeb81e" data-format="banner_300x250"></div>
      </div>
      <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
    </>
  );
}
