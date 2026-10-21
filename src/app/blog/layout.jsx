import BlogAd from './BlogAd.jsx';

const AD_SLOT = '4a5b5f93-ebd9-4d02-b927-05544fdeb81e';
const AD_FORMAT = 'text_link';
const AD_WRAP = { maxWidth: '48rem', margin: '8px auto' };

export default function BlogLayout({ children }) {
  return (
    <>
      {/* Top of the blog content, never at the bottom against the footer. */}
      {/* Primary: a text_link frame, logged-out visitors only. */}
      <BlogAd />
      {/* No-JS fallback — renders only when JavaScript is disabled (e.g. Tor
          Safest mode / .onion). A plain cross-origin iframe that renders and is
          clickable with zero script. Auth can't be checked without JS, so it
          shows to all no-JS visitors, which is fine for a public blog. */}
      <noscript>
        <div className="container" style={AD_WRAP}>
          <iframe
            src={`https://crawlproof.com/api/ads/frame?slot=${AD_SLOT}&format=${AD_FORMAT}`}
            title="Sponsored"
            height={40}
            scrolling="no"
            style={{ border: 0, width: '100%', height: 40, display: 'block' }}
          />
        </div>
      </noscript>
      {children}
    </>
  );
}
