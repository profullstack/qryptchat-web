# Community Plugins

This directory contains third-party plugins for QryptChat.

## Plugin Structure

Each plugin should be in its own directory with the following structure:

```
plugin-name/
├── plugin.json          # Plugin metadata
├── index.js            # Main plugin file
└── README.md           # Plugin documentation
```

## Plugin Metadata (plugin.json)

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "commands": [
    {
      "command": "/help",
      "description": "Show plugin help"
    }
  ]
}
```

## Plugin API

Plugins should export a class with the following methods:

```javascript
export default class PluginName {
  constructor() {
    this.name = 'plugin-name';
  }

  async handleCommand(command, args, context) {
    // Handle plugin commands
  }
}
```

## Available Plugins

- [Echo Plugin](./echo/README.md) - Simple echo example plugin