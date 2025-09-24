# PWA Video Playback Issues & Solutions

## Problem Summary

You're experiencing video playback issues in your desktop PWA (Chrome/Chromium on Linux/KDE) where **audio plays but video doesn't display**. This is **NOT a DRM issue** but rather a combination of codec support, hardware acceleration, and PWA-specific limitations.

## Root Causes Analysis

### 1. **Video Codec Support in PWA Context** (Most Likely)
- Desktop PWAs running in "standalone" mode have different codec support than regular browser tabs
- Linux systems often lack proprietary codecs (H.264, H.265) by default
- PWAs may not have access to system-wide codec installations

### 2. **Hardware Acceleration Issues**
- Desktop PWAs may not have access to hardware video decoding
- Software-only video decoding can fail while audio (less intensive) works fine
- GPU acceleration might be disabled in standalone PWA mode

### 3. **Blob URL Security Restrictions**
- PWAs have stricter Content Security Policy (CSP) restrictions
- Blob URLs for encrypted video content may face additional security barriers

### 4. **Missing System Codecs**
- Linux distributions often ship without proprietary video codecs
- Common missing codecs: H.264, H.265, proprietary AAC variants

## Solutions Implemented

### 1. **Video Diagnostics Utility** (`src/lib/utils/video-diagnostics.js`)

```javascript
import { detectVideoCodecSupport, generateVideoDiagnosticReport } from '$lib/utils/video-diagnostics.js';

// Check what codecs are supported
const support = await detectVideoCodecSupport();
console.log('Supported codecs:', support.supported);

// Generate full diagnostic report
const report = await generateVideoDiagnosticReport();
console.log('Recommendations:', report.recommendations);
```

**Features:**
- Detects supported video/audio codecs
- Checks hardware acceleration availability
- Identifies PWA vs browser context
- Provides specific recommendations for your system

### 2. **Enhanced Video Player** (`src/lib/components/media/EnhancedVideoPlayer.svelte`)

**PWA-Specific Optimizations:**
- Hardware acceleration hints (`transform: translateZ(0)`)
- Automatic retry mechanism on playback failure
- Comprehensive error reporting with diagnostics
- Fallback download options

**Usage:**
```svelte
<EnhancedVideoPlayer 
  src={videoUrl} 
  mimeType="video/mp4"
  filename="video.mp4"
  onError={(e) => console.error('Video error:', e)}
/>
```

### 3. **Improved MessageItem Component**

**Enhanced video handling in chat:**
- Automatic retry on video errors
- Better error messages with download fallbacks
- PWA-optimized video attributes
- Hardware acceleration enablement

## Immediate Solutions

### For Linux/KDE Users:

#### 1. **Install Missing Codecs**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ubuntu-restricted-extras

# Or more comprehensive:
sudo apt install ffmpeg gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav

# Fedora
sudo dnf install gstreamer1-plugins-bad-free gstreamer1-plugins-bad-nonfree gstreamer1-plugins-ugly

# Arch Linux
sudo pacman -S gst-plugins-bad gst-plugins-ugly gst-libav
```

#### 2. **Enable Hardware Acceleration in Chrome**
```bash
# Launch Chrome/Chromium with hardware acceleration flags
google-chrome --enable-features=VaapiVideoDecoder --use-gl=desktop --enable-gpu-rasterization

# Or add to your PWA launcher:
google-chrome --app=https://your-pwa-url.com --enable-features=VaapiVideoDecoder
```

#### 3. **Check Chrome Flags**
Navigate to `chrome://flags/` and enable:
- `#enable-gpu-rasterization`
- `#enable-zero-copy`
- `#enable-hardware-overlays`

### For PWA Manifest Optimization:

Update your `static/manifest.json`:
```json
{
  "name": "QryptChat - Quantum-Resistant Messaging",
  "display": "standalone",
  "start_url": "/?source=pwa",
  "permissions": ["camera", "microphone"],
  "file_handlers": [
    {
      "action": "/",
      "accept": {
        "video/*": [".mp4", ".webm", ".ogg"]
      }
    }
  ]
}
```

## Video Format Recommendations

### **Best Compatibility for PWAs:**

1. **WebM VP8** - Best PWA support, open source
2. **WebM VP9** - Good quality, modern browsers
3. **MP4 H.264** - Widely supported but may need codecs
4. **WebM AV1** - Future-proof but limited support

### **Avoid These Formats in PWAs:**
- H.265/HEVC (limited Linux support)
- Proprietary formats requiring DRM
- High bitrate 4K videos (software decoding issues)

## Testing Your Implementation

### 1. **Run Diagnostics**
```javascript
import { generateVideoDiagnosticReport } from '$lib/utils/video-diagnostics.js';

const report = await generateVideoDiagnosticReport();
console.log('PWA Mode:', report.environment.isPWA);
console.log('Codec Support:', report.codecSupport);
console.log('Hardware Acceleration:', report.hardwareAcceleration);
```

### 2. **Test Different Formats**
```javascript
import { testVideoPlayback } from '$lib/utils/video-diagnostics.js';

const formats = [
  'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
  'https://sample-videos.com/zip/10/webm/SampleVideo_1280x720_1mb.webm'
];

for (const url of formats) {
  const result = await testVideoPlayback(url);
  console.log(`${url}: Video=${result.hasVideo}, Audio=${result.hasAudio}`);
}
```

## Debugging Steps

### 1. **Check Browser Console**
Look for errors like:
- `"Format error"` - Codec not supported
- `"Network error"` - Loading issues
- `"Decode error"` - Hardware/software decoding failure

### 2. **Chrome DevTools Media Tab**
1. Open DevTools (F12)
2. Go to "Media" tab
3. Play a video and check for:
   - Decoder information
   - Hardware acceleration status
   - Error messages

### 3. **System-Level Debugging**
```bash
# Check available GStreamer plugins
gst-inspect-1.0 | grep -i video

# Test video playback directly
gst-play-1.0 /path/to/video.mp4

# Check hardware acceleration
vainfo  # For Intel/AMD
nvidia-smi  # For NVIDIA
```

## DRM Clarification

**Your issue is NOT DRM-related because:**
- DRM (Digital Rights Management) would block ALL playback, including audio
- DRM requires specific APIs (EME/Widevine) that show different error messages
- Your encrypted files use client-side encryption, not DRM

**DRM would be needed for:**
- Netflix, Disney+, Amazon Prime content
- Protected streaming services
- Content with `encrypted` media source extensions

## Performance Optimizations

### 1. **Video Element Optimizations**
```html
<video 
  preload="metadata"
  playsinline
  webkit-playsinline
  style="transform: translateZ(0)"
>
```

### 2. **Blob URL Management**
```javascript
// Revoke blob URLs when done to free memory
const mediaUrl = URL.createObjectURL(blob);
// ... use mediaUrl
URL.revokeObjectURL(mediaUrl);
```

### 3. **Progressive Loading**
```javascript
// Load video metadata first, then full video on user interaction
video.preload = 'metadata';
video.addEventListener('canplay', () => {
  // Video is ready to play
});
```

## Future Improvements

1. **Adaptive Streaming**: Implement different quality levels based on connection
2. **Format Detection**: Automatically serve best format for user's system
3. **Offline Caching**: Cache frequently accessed videos for PWA offline use
4. **Background Processing**: Pre-process videos to optimal formats

## Support Matrix

| Format | Chrome PWA | Firefox PWA | Safari PWA | Linux Support |
|--------|------------|-------------|------------|---------------|
| WebM VP8 | ✅ | ✅ | ❌ | ✅ |
| WebM VP9 | ✅ | ✅ | ❌ | ✅ |
| MP4 H.264 | ⚠️* | ⚠️* | ✅ | ⚠️* |
| WebM AV1 | ✅ | ✅ | ❌ | ✅ |

*Requires system codecs installation

## Conclusion

Your video playback issue is primarily due to missing video codecs on Linux and PWA-specific limitations. The solutions provided include:

1. **Immediate fixes**: Install system codecs and enable hardware acceleration
2. **Code improvements**: Enhanced video player with diagnostics and retry logic
3. **Format optimization**: Use WebM formats for better Linux/PWA compatibility
4. **Debugging tools**: Comprehensive diagnostics to identify specific issues

The enhanced video player and diagnostics utility will help identify the exact cause of playback failures and provide users with actionable solutions.