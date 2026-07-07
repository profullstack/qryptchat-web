import BlogAd from './BlogAd.jsx';

const AD_SLOT = '4a5b5f93-ebd9-4d02-b927-05544fdeb81e';
const AD_FORMAT = 'banner_300x250';
const AD_WRAP = { maxWidth: '48rem', margin: '0 auto', padding: '1.5rem 0', display: 'flex', justifyContent: 'center' };

export default function BlogLayout({ children }) {
  return (
    <>
      {children}
      {/* Primary: standard CrawlProof snippet via ad.js, logged-out visitors only. */}
      <BlogAd />
      {/* No-JS fallback — renders only when JavaScript is disabled (e.g. Tor
          Safest mode / .onion). A plain cross-origin iframe that renders and is
          clickable with zero script. Auth can't be checked without JS, so it
          shows to all no-JS visitors, which is fine for a public blog. */}
      <noscript>
        <div className="container" style={AD_WRAP}>
          <iframe
            src={`https://crawlproof.com/api/ads/frame?slot=${AD_SLOT}&format=${AD_FORMAT}`}
            title="Advertisement"
            width={300}
            height={250}
            scrolling="no"
            style={{ border: 0, width: 300, height: 250, maxWidth: '100%' }}
          />
        </div>
      </noscript>
    </>
  );
}
