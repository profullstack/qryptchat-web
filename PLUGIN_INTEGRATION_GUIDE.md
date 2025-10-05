# Plugin Integration Guide

This guide explains how to integrate the community plugin system into QryptChat's chat interface.

## Overview

The plugin system allows users to extend QryptChat functionality through community-contributed plugins. Users can type commands like `/help` or `/echo Hello!` in chat to interact with plugins.

## Integration Steps

### 1. Import Plugin Manager

```javascript
import { pluginManager } from '$lib/plugins/PluginManager.js';
```

### 2. Initialize Plugin Manager

Initialize the plugin manager when your chat component mounts:

```javascript
import { onMount } from 'svelte';

onMount(async () => {
  await pluginManager.initialize();
});
```

### 3. Process Messages

Before sending a message, check if it's a plugin command:

```javascript
async function handleMessage(message) {
  // Check if it's a plugin command
  if (pluginManager.isPluginCommand(message)) {
    try {
      const response = await fetch('/api/plugins/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          context: {
            userId: currentUser.id,
            chatId: currentChat.id,
            timestamp: new Date().toISOString()
          }
        })
      });

      const result = await response.json();
      
      if (result.response) {
        // Display plugin response in chat
        displayMessage({
          content: result.response,
          sender: 'Plugin',
          type: 'plugin-response',
          timestamp: new Date()
        });
        return; // Don't send as regular message
      }
    } catch (error) {
      console.error('Plugin command failed:', error);
      // Fall through to send as regular message
    }
  }

  // Send as regular message
  sendRegularMessage(message);
}
```

### 4. Add Plugin Help

Add a help command handler:

```javascript
async function showPluginHelp() {
  try {
    const response = await fetch('/api/plugins/execute');
    const data = await response.json();
    
    displayMessage({
      content: data.helpText,
      sender: 'System',
      type: 'help',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to get plugin help:', error);
  }
}
```

### 5. UI Integration

Add a plugins link to your navigation:

```html
<a href="/plugins" class="nav-link">
  Plugins
</a>
```

## Example Chat Integration

Here's a complete example of integrating plugins into a chat component:

```svelte
<script>
  import { onMount } from 'svelte';
  import { pluginManager } from '$lib/plugins/PluginManager.js';
  
  let messages = [];
  let messageInput = '';
  
  onMount(async () => {
    await pluginManager.initialize();
  });
  
  async function sendMessage() {
    if (!messageInput.trim()) return;
    
    const message = messageInput.trim();
    messageInput = '';
    
    // Add user message to chat
    messages = [...messages, {
      content: message,
      sender: 'You',
      timestamp: new Date()
    }];
    
    // Check for plugin commands
    if (message.startsWith('/')) {
      try {
        const response = await fetch('/api/plugins/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        
        const result = await response.json();
        
        if (result.response) {
          messages = [...messages, {
            content: result.response,
            sender: 'Plugin',
            type: 'plugin',
            timestamp: new Date()
          }];
          return;
        }
      } catch (error) {
        console.error('Plugin error:', error);
      }
    }
    
    // Handle regular message...
  }
</script>

<div class="chat-container">
  {#each messages as message}
    <div class="message {message.type || ''}">
      <strong>{message.sender}:</strong>
      {message.content}
    </div>
  {/each}
</div>

<input 
  bind:value={messageInput}
  on:keydown={(e) => e.key === 'Enter' && sendMessage()}
  placeholder="Type a message or /help for plugins..."
/>
```

## Plugin Commands

The system automatically recognizes these patterns:

- `/help` - Show all available plugin commands
- `/echo <message>` - Echo plugin example
- Any command starting with `/` will be checked against loaded plugins

## Error Handling

Always handle plugin errors gracefully:

```javascript
try {
  const result = await pluginManager.processCommand(message);
  if (result) {
    // Handle plugin response
  }
} catch (error) {
  console.error('Plugin error:', error);
  // Show user-friendly error message
}
```

## Security Considerations

1. **Input Validation**: Always validate plugin inputs
2. **Sandboxing**: Consider sandboxing plugin execution
3. **Rate Limiting**: Implement rate limiting for plugin commands
4. **User Permissions**: Check user permissions before executing plugins

## Testing

Test plugin integration with:

```javascript
// Test plugin loading
await pluginManager.initialize();
console.log('Loaded plugins:', pluginManager.plugins.size);

// Test command processing
const response = await pluginManager.processCommand('/help');
console.log('Help response:', response);
```