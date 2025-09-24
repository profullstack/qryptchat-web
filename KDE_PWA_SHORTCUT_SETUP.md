# KDE PWA Shortcut Setup with Hardware Acceleration

## Method 1: Modify Existing Desktop File (Recommended)

### Step 1: Find Your PWA Desktop File
Your PWA shortcut is likely located in one of these directories:

```bash
# Check user-specific applications
ls ~/.local/share/applications/ | grep -i qrypt

# Check system-wide applications  
ls /usr/share/applications/ | grep -i qrypt

# Check for Chrome PWA files
ls ~/.local/share/applications/ | grep chrome
```

### Step 2: Edit the Desktop File
Once you find your PWA's `.desktop` file (e.g., `chrome-qryptchat.desktop`):

```bash
# Edit the desktop file
nano ~/.local/share/applications/chrome-qryptchat.desktop
```

### Step 3: Modify the Exec Line
Change the `Exec=` line to include hardware acceleration flags:

**Before:**
```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=QryptChat
Comment=Quantum-Resistant Messaging
Exec=/usr/bin/google-chrome --profile-directory=Default --app-id=your-app-id
Icon=chrome-qryptchat
StartupWMClass=crx_your-app-id
NoDisplay=false
```

**After:**
```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=QryptChat
Comment=Quantum-Resistant Messaging
Exec=/usr/bin/google-chrome --profile-directory=Default --app-id=your-app-id --enable-features=VaapiVideoDecoder --use-gl=desktop --enable-gpu-rasterization --enable-zero-copy --enable-hardware-overlays
Icon=chrome-qryptchat
StartupWMClass=crx_your-app-id
NoDisplay=false
```

### Step 4: Save and Test
```bash
# Save the file (Ctrl+X, Y, Enter in nano)
# Test the shortcut
gtk-launch chrome-qryptchat.desktop
```

## Method 2: Create Custom Desktop File

If you can't find the existing file or want a clean custom one:

### Step 1: Create New Desktop File
```bash
nano ~/.local/share/applications/qryptchat-optimized.desktop
```

### Step 2: Add Content
```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=QryptChat (Optimized)
Comment=Quantum-Resistant Messaging with Hardware Acceleration
Exec=/usr/bin/google-chrome --app=https://your-pwa-url.com --enable-features=VaapiVideoDecoder --use-gl=desktop --enable-gpu-rasterization --enable-zero-copy --enable-hardware-overlays --disable-web-security --user-data-dir=/tmp/chrome-pwa
Icon=/path/to/your/icon.png
StartupWMClass=your-pwa-url.com
NoDisplay=false
Categories=Network;Chat;
MimeType=x-scheme-handler/https;
```

### Step 3: Make Executable and Install
```bash
# Make executable
chmod +x ~/.local/share/applications/qryptchat-optimized.desktop

# Update desktop database
update-desktop-database ~/.local/share/applications/
```

## Method 3: KDE Application Menu Editor

### Step 1: Open KDE Menu Editor
```bash
# Launch KDE Menu Editor
kmenuedit
```

### Step 2: Find Your PWA
1. Navigate through the menu structure to find your PWA
2. Right-click on it and select "Properties"

### Step 3: Modify Command
In the "Command" field, add the hardware acceleration flags:
```bash
/usr/bin/google-chrome --app=https://your-pwa-url.com --enable-features=VaapiVideoDecoder --use-gl=desktop --enable-gpu-rasterization
```

### Step 4: Save Changes
Click "Save" and close the menu editor.

## Method 4: Custom Shell Script (Advanced)

### Step 1: Create Launch Script
```bash
nano ~/bin/launch-qryptchat.sh
```

### Step 2: Add Script Content
```bash
#!/bin/bash

# QryptChat PWA Launcher with Hardware Acceleration
# Optimized for video playback on Linux/KDE

# Chrome/Chromium executable (adjust path if needed)
CHROME_EXEC="/usr/bin/google-chrome"

# Your PWA URL
PWA_URL="https://your-pwa-url.com"

# Hardware acceleration flags
HW_ACCEL_FLAGS=(
    "--enable-features=VaapiVideoDecoder"
    "--use-gl=desktop"
    "--enable-gpu-rasterization"
    "--enable-zero-copy"
    "--enable-hardware-overlays"
    "--enable-accelerated-video-decode"
    "--ignore-gpu-blacklist"
    "--enable-gpu-memory-buffer-video-frames"
)

# PWA-specific flags
PWA_FLAGS=(
    "--app=$PWA_URL"
    "--disable-web-security"
    "--user-data-dir=$HOME/.config/qryptchat-pwa"
    "--disable-features=TranslateUI"
    "--disable-default-apps"
    "--disable-extensions"
)

# Launch PWA with all optimizations
exec "$CHROME_EXEC" "${HW_ACCEL_FLAGS[@]}" "${PWA_FLAGS[@]}" "$@"
```

### Step 3: Make Executable
```bash
chmod +x ~/bin/launch-qryptchat.sh
```

### Step 4: Create Desktop File for Script
```bash
nano ~/.local/share/applications/qryptchat-script.desktop
```

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=QryptChat (Script)
Comment=QryptChat with optimized video playback
Exec=/home/yourusername/bin/launch-qryptchat.sh
Icon=qryptchat
StartupWMClass=your-pwa-url.com
NoDisplay=false
Categories=Network;Chat;
```

## Hardware Acceleration Flags Explained

| Flag | Purpose |
|------|---------|
| `--enable-features=VaapiVideoDecoder` | Enable VA-API hardware video decoding (Intel/AMD) |
| `--use-gl=desktop` | Use desktop OpenGL instead of ANGLE |
| `--enable-gpu-rasterization` | Enable GPU-accelerated rasterization |
| `--enable-zero-copy` | Enable zero-copy video decode path |
| `--enable-hardware-overlays` | Enable hardware overlay planes |
| `--enable-accelerated-video-decode` | Force enable hardware video decode |
| `--ignore-gpu-blacklist` | Ignore GPU blacklist (use with caution) |

## Verification Steps

### Step 1: Check Hardware Acceleration
After launching your PWA with the new flags:

1. Open Chrome DevTools (F12)
2. Go to `chrome://gpu/` in a new tab
3. Look for "Video Decode" and "Video Encode" status
4. Should show "Hardware accelerated" instead of "Software only"

### Step 2: Test Video Playback
1. Try playing a video in your PWA
2. Check Chrome's Media tab in DevTools
3. Look for hardware decoder information

### Step 3: Monitor Performance
```bash
# Monitor GPU usage (Intel)
intel_gpu_top

# Monitor GPU usage (AMD)
radeontop

# Monitor GPU usage (NVIDIA)
nvidia-smi -l 1
```

## Troubleshooting

### Issue: Hardware Acceleration Not Working
**Solution:** Check if VA-API is properly installed:
```bash
# Install VA-API drivers
sudo apt install vainfo libva-drm2 libva-x11-2

# Test VA-API
vainfo
```

### Issue: PWA Won't Launch
**Solution:** Check Chrome executable path:
```bash
# Find Chrome executable
which google-chrome
which chromium-browser
which chrome
```

### Issue: Permission Denied
**Solution:** Fix file permissions:
```bash
chmod +x ~/.local/share/applications/your-pwa.desktop
chmod +x ~/bin/launch-qryptchat.sh
```

### Issue: Icon Not Showing
**Solution:** Use full path to icon or system icon name:
```ini
Icon=/usr/share/pixmaps/chrome.png
# or
Icon=web-browser
```

## Advanced Configuration

### For NVIDIA Users
Add these additional flags:
```bash
--enable-features=VaapiVideoDecoder,VaapiIgnoreDriverChecks
--disable-gpu-sandbox
```

### For AMD Users
Ensure Mesa drivers are up to date:
```bash
sudo apt update
sudo apt install mesa-va-drivers
```

### For Intel Users
Install Intel media drivers:
```bash
sudo apt install intel-media-va-driver
```

## Testing Your Setup

Create a test script to verify everything works:

```bash
#!/bin/bash
# test-pwa-video.sh

echo "Testing PWA video setup..."

# Check hardware acceleration
echo "1. Checking VA-API support:"
vainfo | grep -E "(Driver|Entrypoint)"

# Check Chrome GPU status
echo "2. Launching Chrome GPU info..."
google-chrome --enable-features=VaapiVideoDecoder --use-gl=desktop chrome://gpu/ &

# Launch your PWA
echo "3. Launching optimized PWA..."
sleep 3
~/.local/share/applications/qryptchat-optimized.desktop

echo "Setup complete! Check video playback in your PWA."
```

Your KDE shortcut should now launch your PWA with full hardware acceleration support, significantly improving video playback performance!