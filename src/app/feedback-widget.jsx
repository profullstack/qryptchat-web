'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Routes where the feedback button overlaps the chat send button.
const CHAT_ROUTE_PREFIXES = ['/chat', '/chats', '/u', '/anon'];

function isChatRoute(pathname) {
  if (!pathname) return false;
  return CHAT_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function FeedbackWidget() {
  const pathname = usePathname();

  useEffect(() => {
    if (isChatRoute(pathname)) return undefined;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://feedback.profullstack.com/embed/profullstack-feedback.js';
    script.dataset.property = 'qrypt.chat';
    document.body.appendChild(script);

    return () => {
      script.remove();
      // Remove any widget DOM the embed injected so it doesn't linger on chat pages.
      document
        .querySelectorAll('[id*="profullstack-feedback"], [class*="profullstack-feedback"]')
        .forEach((el) => el.remove());
    };
  }, [pathname]);

  return null;
}
