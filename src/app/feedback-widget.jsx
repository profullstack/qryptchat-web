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

// The feedback embed injects #pf-fab (floating button) and #pf-panel.
const HIDE_STYLE_ID = 'pf-feedback-hide';
function removeWidget() {
  document
    .querySelectorAll('#pf-fab, #pf-panel, script[data-property="qrypt.chat"]')
    .forEach((el) => el.remove());
}

export default function FeedbackWidget() {
  const pathname = usePathname();

  useEffect(() => {
    if (isChatRoute(pathname)) {
      // On chat pages: remove the widget AND keep a style rule so it stays gone
      // even if the embed (loaded on a previous page) injects #pf-fab late.
      removeWidget();
      if (!document.getElementById(HIDE_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = HIDE_STYLE_ID;
        style.textContent = '#pf-fab,#pf-panel{display:none !important;}';
        document.head.appendChild(style);
      }
      return undefined;
    }

    // Non-chat pages: drop the hide rule and load the widget.
    document.getElementById(HIDE_STYLE_ID)?.remove();
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://feedback.profullstack.com/embed/profullstack-feedback.js';
    script.dataset.property = 'qrypt.chat';
    document.body.appendChild(script);

    return () => {
      script.remove();
      removeWidget();
    };
  }, [pathname]);

  return null;
}
