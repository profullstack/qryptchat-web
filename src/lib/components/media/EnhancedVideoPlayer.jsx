'use client';

import { useRef, useEffect } from 'react';
import { createPlayer } from '@profullstack/player';
import '@profullstack/player/player.css';

/**
 * Plays a video or audio attachment in the house player (@profullstack/player):
 * one control bar with auto-hide, full screen including iPhone.
 *
 * Attachments are decrypted into blob: URLs, which carry no file extension, so
 * the caller passes the MIME type and the player is told the kind outright
 * instead of sniffing the URL.
 */
export default function EnhancedVideoPlayer({ src, type = 'video/mp4', audio = false, autoPlay = false, className = '' }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !src) return undefined;
    const isAudio = audio || (type || '').toLowerCase().startsWith('audio/');
    const handle = createPlayer(root, {
      src,
      kind: isAudio ? 'audio' : 'mp4',
      audio: isAudio,
      ...(type ? { mimeType: type } : {}),
      autoplay: autoPlay,
    });
    return () => handle.destroy();
  }, [src, type, audio, autoPlay]);

  return <div ref={rootRef} className={`video-player ${className}`.trim()} />;
}
