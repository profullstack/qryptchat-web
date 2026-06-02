'use client';

import { useRef, useEffect } from 'react';

export default function EnhancedVideoPlayer({ src, type = 'video/mp4', controls = true, autoPlay = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && src) {
      videoRef.current.load();
    }
  }, [src]);

  return (
    <div className="video-player">
      <video ref={videoRef} controls={controls} autoPlay={autoPlay} style={{ width: '100%', borderRadius: '.5rem' }}>
        <source src={src} type={type} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
