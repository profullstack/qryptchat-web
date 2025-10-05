# ASCII Art Support in Messages

## Overview

The message rendering system now automatically detects and properly displays ASCII art in chat messages. When ASCII art is detected, the message text is rendered with a monospace font and proper whitespace preservation to maintain the visual structure.

## Features

### Automatic Detection

The system automatically detects ASCII art based on multiple criteria:

1. **Box Drawing Characters**: Unicode box drawing characters (│, ─, ┌, └, etc.)
2. **Special Characters**: Common ASCII art characters (|, /, \, _, -, +, *, #, @, etc.)
3. **Repeated Patterns**: Figlet-style ASCII art with repeated characters (like "88" or "***")

### Detection Rules

ASCII art is detected when:
- The message has at least 3 non-empty lines
- At least 3 of those lines contain ASCII art patterns:
  - Box drawing or special Unicode characters
  - At least 3 special ASCII characters in a line
  - Repeated character patterns (3+ consecutive same characters) in lines longer than 5 characters

### Rendering

When ASCII art is detected, the message text receives special styling:

```css
.message-text.ascii-art {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: pre;
  overflow-x: auto;
  letter-spacing: 0;
}
```

This ensures:
- Monospace font for proper character alignment
- Preserved whitespace (spaces, tabs, newlines)
- Horizontal scrolling for wide ASCII art
- Consistent character spacing

## Examples

### Figlet-Style ASCII Art

```
88                                           88 
88                                           88 
88                                           88 
88,dPPYba,  8b,dPPYba,  ,adPPYba, ,adPPYYba, 88   ,d8 
88P'    "8a 88P'   "Y8 a8P_____88 ""     `Y8 88 ,a8" 
88       d8 88         8PP""""""" ,adPPPPP88 8888[ 
88b,   ,a8" 88         "8b,   ,aa 88,    ,88 88`"Yba, 
8Y"Ybbd8"'  88          `"Ybbd8"' `"8bbdP"Y8 88   `Y8a
```

### Box Drawing ASCII Art

```
╔═══════════════╗
║   Hello Box   ║
║   ASCII Art   ║
╚═══════════════╝
```

### Simple ASCII Art

```
  /\_/\  
 ( o.o ) 
  > ^ <
 /|   |\
(_|   |_)
```

### Banner-Style ASCII Art

```
***********************
*   WELCOME MESSAGE   *
*   ASCII ART DEMO    *
***********************
```

## Implementation Details

### Files Modified

1. **[`src/lib/components/chat/MessageItem.svelte`](../src/lib/components/chat/MessageItem.svelte)**: Added ASCII art detection logic and conditional styling
2. **[`src/lib/utils/url-link-converter.js`](../src/lib/utils/url-link-converter.js)**: Already handles whitespace preservation with `&nbsp;` for multiple spaces

### Detection Logic

The detection is implemented as a Svelte derived state that runs whenever the message content changes:

```javascript
const isAsciiArt = $derived(() => {
  const lines = decryptedContent.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 3) return false;
  
  const asciiArtChars = /[│┤┐└┴┬├─┼╔╗╚╝║═╠╣╩╦╬▀▄█▌▐░▒▓■□▪▫◘◙◚◛◜◝◞◟◠◡◢◣◤◥●◦◯◰◱◲◳◴◵◶◷◸◹◺◻◼◽◾◿]/;
  const commonAsciiChars = /[|\/\\\_\-\+\*\#\@\%\&\$\^\~\`\(\)\[\]\{\}<>]/g;
  
  const linesWithAsciiArt = lines.filter(line => {
    if (asciiArtChars.test(line)) return true;
    const specialCharCount = (line.match(commonAsciiChars) || []).length;
    if (specialCharCount >= 3) return true;
    if (/(.)\1{2,}/.test(line) && line.length > 5) return true;
    return false;
  });
  
  return linesWithAsciiArt.length >= 3;
});
```

### Testing

Comprehensive tests are available in [`tests/ascii-art-detection.test.js`](../tests/ascii-art-detection.test.js) covering:
- Box drawing characters
- Common ASCII art patterns
- Repeated character patterns
- False positive prevention (regular text, code snippets)
- Edge cases (empty strings, single lines)

Run tests with:
```bash
node tests/ascii-art-detection.test.js
```

## Browser Compatibility

The feature uses standard CSS and JavaScript features supported by all modern browsers:
- CSS `white-space: pre` for whitespace preservation
- CSS `overflow-x: auto` for horizontal scrolling
- Standard regex patterns for detection

## Performance

The ASCII art detection is:
- Computed only when message content changes (Svelte derived state)
- Lightweight regex-based detection
- No external dependencies
- Minimal performance impact

## Future Enhancements

Potential improvements:
- Support for ANSI color codes in ASCII art
- Configurable detection sensitivity
- Manual toggle for ASCII art rendering
- Support for ASCII art in code blocks