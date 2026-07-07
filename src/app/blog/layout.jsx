import Script from 'next/script';

export default function BlogLayout({ children }) {
  return (
    <>
      {children}
      <div className="container" style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
        <div data-cp-ad data-slot="4a5b5f93-ebd9-4d02-b927-05544fdeb81e" data-format="banner_300x250"></div>
      </div>
      <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
    </>
  );
}
