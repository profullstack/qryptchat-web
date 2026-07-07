import BlogAd from './BlogAd.jsx';

export default function BlogLayout({ children }) {
  return (
    <>
      {children}
      <BlogAd />
    </>
  );
}
