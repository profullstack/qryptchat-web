'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';

// CrawlProof banner for logged-out visitors on /blog/*.
//
// qrypt.chat deliberately loads NO third-party JavaScript for ads: instead of
// the data-cp-ad + ad.js snippet, the ad is a plain cross-origin <iframe>
// pointing at CrawlProof's server-rendered HTML endpoint. The ad's own code
// runs inside that iframe (crawlproof origin), never in qrypt.chat's page, and
// the click link (target="_blank") opens in a new tab — the PWA's JS can't
// touch it. This is also what .onion publishers embed (works with zero JS).
//
// The auth store hydrates from localStorage on the client, so we wait for mount
// + the initial `loading` to settle before deciding, to avoid flashing an ad at
// a signed-in user. Visitors with JS disabled get the <noscript> iframe in the
// blog layout instead.
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
