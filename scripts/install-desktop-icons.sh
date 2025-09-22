#!/bin/bash

# Install QryptChat icons to Linux desktop environment
# This script installs icons to the system icon theme for proper desktop integration

echo "🎨 Installing QryptChat icons for Linux desktop environments..."

# Define icon install paths
ICON_THEME_DIR="$HOME/.local/share/icons/hicolor"
DESKTOP_DIR="$HOME/.local/share/applications"

# Create icon theme directories
mkdir -p "$ICON_THEME_DIR"/{16x16,32x32,48x48,64x64,128x128,256x256,512x512}/apps

# Copy icons to proper locations
echo "📁 Installing icons to $ICON_THEME_DIR..."

# Install various sizes
cp ./static/icons/apple-touch-icon-57x57.png "$ICON_THEME_DIR/48x48/apps/qryptchat.png" 2>/dev/null || echo "⚠️  48x48 icon not found"
cp ./static/icons/apple-touch-icon-72x72.png "$ICON_THEME_DIR/64x64/apps/qryptchat.png" 2>/dev/null || echo "⚠️  64x64 icon not found"
cp ./static/icons/apple-touch-icon-152x152.png "$ICON_THEME_DIR/128x128/apps/qryptchat.png" 2>/dev/null || echo "⚠️  128x128 icon not found"
cp ./static/icons/icon-256x256.png "$ICON_THEME_DIR/256x256/apps/qryptchat.png" 2>/dev/null || echo "⚠️  256x256 icon not found"
cp ./static/icons/icon-512x512.png "$ICON_THEME_DIR/512x512/apps/qryptchat.png" 2>/dev/null || echo "⚠️  512x512 icon not found"

# Try to copy smaller sizes as fallbacks
if [ -f "./static/favicon-32.png" ]; then
    cp ./static/favicon-32.png "$ICON_THEME_DIR/32x32/apps/qryptchat.png"
    echo "✅ Installed 32x32 icon"
fi

if [ -f "./static/favicon-16.png" ]; then
    cp ./static/favicon-16.png "$ICON_THEME_DIR/16x16/apps/qryptchat.png"
    echo "✅ Installed 16x16 icon"
fi

echo "✅ Installed QryptChat icons to hicolor icon theme"

# Install desktop file
echo "📋 Installing desktop file to $DESKTOP_DIR..."
mkdir -p "$DESKTOP_DIR"
cp ./static/qryptchat.desktop "$DESKTOP_DIR/" 2>/dev/null || echo "⚠️  Desktop file not found"

if [ -f "$DESKTOP_DIR/qryptchat.desktop" ]; then
    echo "✅ Installed QryptChat desktop file"
else
    echo "❌ Failed to install desktop file"
fi

# Update icon cache
echo "🔄 Updating icon cache..."
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || echo "⚠️  Could not update GTK icon cache"
    echo "✅ Updated GTK icon cache"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || echo "⚠️  Could not update desktop database"
    echo "✅ Updated desktop database"
fi

echo "
🎉 Installation complete!

📱 The QryptChat PWA should now display proper icons in:
   • KDE desktop environment
   • GNOME desktop environment  
   • System application menus
   • Taskbar/dock when installed

🔧 Manual steps (if icons still don't appear):
   1. Log out and log back in
   2. Clear browser cache and reinstall PWA
   3. Run: gtk-update-icon-cache -f ~/.local/share/icons/hicolor
   
📂 Icons installed to:
   • $ICON_THEME_DIR/*/apps/qryptchat.png
   • $DESKTOP_DIR/qryptchat.desktop
"