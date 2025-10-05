/**
 * Plugin Manager - Handles loading and executing community plugins
 */
export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.commands = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the plugin manager and load all plugins
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const response = await fetch('/api/plugins');
      if (!response.ok) {
        throw new Error('Failed to fetch plugins');
      }

      const pluginList = await response.json();
      
      for (const pluginMeta of pluginList) {
        await this.loadPlugin(pluginMeta);
      }

      this.initialized = true;
      console.log(`Plugin Manager initialized with ${this.plugins.size} plugins`);
    } catch (error) {
      console.error('Failed to initialize Plugin Manager:', error);
    }
  }

  /**
   * Load a single plugin
   * @param {object} pluginMeta - Plugin metadata
   */
  async loadPlugin(pluginMeta) {
    try {
      // In a real implementation, you'd dynamically import the plugin
      // For now, we'll simulate plugin loading with the echo plugin
      if (pluginMeta.name === 'echo') {
        const EchoPlugin = (await import('../../../community-plugins/echo/index.js')).default;
        const pluginInstance = new EchoPlugin();
        
        // Initialize plugin if it has an initialize method
        if (typeof pluginInstance.initialize === 'function') {
          await pluginInstance.initialize();
        }

        this.plugins.set(pluginMeta.name, {
          instance: pluginInstance,
          metadata: pluginMeta
        });

        // Register plugin commands
        for (const command of pluginMeta.commands) {
          this.commands.set(command.command, pluginMeta.name);
        }

        console.log(`Loaded plugin: ${pluginMeta.name} v${pluginMeta.version}`);
      }
    } catch (error) {
      console.error(`Failed to load plugin ${pluginMeta.name}:`, error);
    }
  }

  /**
   * Process a command message
   * @param {string} message - The message to process
   * @param {object} context - Chat context
   * @returns {Promise<string|null>} Plugin response or null if not a plugin command
   */
  async processCommand(message, context = {}) {
    if (!message.startsWith('/')) {
      return null;
    }

    const parts = message.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    // Check if it's a registered plugin command
    const pluginName = this.commands.get(command);
    if (!pluginName) {
      return null;
    }

    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return `Plugin ${pluginName} not found`;
    }

    try {
      const response = await plugin.instance.handleCommand(command, args, context);
      return response;
    } catch (error) {
      console.error(`Error executing plugin command ${command}:`, error);
      return `Error executing command: ${error.message}`;
    }
  }

  /**
   * Get list of all available commands
   * @returns {Array} List of available commands with descriptions
   */
  getAvailableCommands() {
    const commands = [];
    
    for (const [pluginName, plugin] of this.plugins) {
      for (const command of plugin.metadata.commands) {
        commands.push({
          command: command.command,
          description: command.description,
          plugin: pluginName
        });
      }
    }

    return commands;
  }

  /**
   * Get help text for all plugins
   * @returns {string} Formatted help text
   */
  getHelpText() {
    if (this.plugins.size === 0) {
      return 'No plugins are currently loaded.';
    }

    let helpText = '**Available Plugin Commands:**\n\n';
    
    for (const [pluginName, plugin] of this.plugins) {
      helpText += `**${plugin.metadata.name} v${plugin.metadata.version}**\n`;
      helpText += `${plugin.metadata.description}\n\n`;
      
      for (const command of plugin.metadata.commands) {
        helpText += `• \`${command.command}\` - ${command.description}\n`;
      }
      helpText += '\n';
    }

    return helpText;
  }

  /**
   * Check if a message is a plugin command
   * @param {string} message - Message to check
   * @returns {boolean} True if it's a plugin command
   */
  isPluginCommand(message) {
    if (!message.startsWith('/')) return false;
    
    const command = message.trim().split(/\s+/)[0];
    return this.commands.has(command);
  }
}

// Export singleton instance
export const pluginManager = new PluginManager();