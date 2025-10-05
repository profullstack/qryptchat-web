/**
 * Echo Plugin - Simple example plugin for QryptChat
 */
export default class EchoPlugin {
  constructor() {
    this.name = 'echo';
    this.version = '1.0.0';
  }

  /**
   * Handle plugin commands
   * @param {string} command - The command that was triggered
   * @param {string[]} args - Command arguments
   * @param {object} context - Chat context (user, chat, etc.)
   * @returns {Promise<string>} Response message
   */
  async handleCommand(command, args, context) {
    switch (command) {
      case '/help':
        return this.getHelp();
      
      case '/echo':
        if (args.length === 0) {
          return 'Usage: /echo <message> - Echo back your message';
        }
        return `Echo: ${args.join(' ')}`;
      
      default:
        return `Unknown command: ${command}. Type /help for available commands.`;
    }
  }

  /**
   * Get plugin help text
   * @returns {string} Help text
   */
  getHelp() {
    return `**Echo Plugin v${this.version}**

Available commands:
• \`/echo <message>\` - Echo back your message
• \`/help\` - Show this help message

Example: \`/echo Hello World!\` → Echo: Hello World!`;
  }

  /**
   * Plugin initialization (optional)
   */
  async initialize() {
    console.log(`Echo plugin v${this.version} initialized`);
  }

  /**
   * Plugin cleanup (optional)
   */
  async cleanup() {
    console.log('Echo plugin cleaned up');
  }
}