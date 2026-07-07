'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';

// CrawlProof banner, shown only to logged-out visitors on /blog/*.
//
// The ad is a plain cross-origin <iframe> pointing at CrawlProof's server-
// rendered HTML endpoint — NOT the data-cp-ad + ad.js path. That means it
// renders and is clickable with no ad.js on the page, and the click link lives
// inside CrawlProof's own document, so the PWA's own JS (visibility handlers,
// service worker, etc.) can never intercept the click-through.
//
// The auth store hydrates from localStorage on the client, so we wait for mount
// + the initial `loading` to settle before deciding, to avoid flashing an ad at
// a signed-in user.
const AD_SLOT = '4a5b5f93-ebd9-4d02-b927-05544fdeb81e';
const AD_FORMAT = 'banner_300x250';
const AD_SRC = `https://crawlproof.com/api/ads/frame?slot=${AD_SLOT}&format=${AD_FORMAT}`;

export default function BlogAd() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading || user) return null;

  return (
    <div className="container" style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
      <iframe
        src={AD_SRC}
        title="Advertisement"
        width={300}
        height={250}
        scrolling="no"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ border: 0, width: 300, height: 250, maxWidth: '100%' }}
      />
    </div>
  );
}
