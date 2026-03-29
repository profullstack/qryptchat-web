/**
 * Time Plugin - Look up current time in any timezone/city
 * Uses WorldTimeAPI (worldtimeapi.org) for timezone data
 */
export default class TimePlugin {
  constructor() {
    this.name = 'time';
    this.version = '1.0.0';
    this.apiBase = 'https://worldtimeapi.org/api';
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
      case '/time':
        if (args.length === 0) {
          return this.getHelp();
        }
        return this.getTime(args.join(' '));

      default:
        return `Unknown command: ${command}. Type /time for help.`;
    }
  }

  /**
   * Look up the current time for a place/timezone
   * @param {string} place - City or timezone identifier
   * @returns {Promise<string>} Formatted time response
   */
  async getTime(place) {
    const query = place.trim().toLowerCase();

    try {
      // First, fetch the list of available timezones
      const listRes = await fetch(`${this.apiBase}/timezone`);
      if (!listRes.ok) {
        return `⏱ Could not reach the time service. Please try again later.`;
      }
      const timezones = await listRes.json();

      // Find matching timezone(s) by searching for the query in timezone identifiers
      const matches = timezones.filter((tz) => tz.toLowerCase().includes(query));

      if (matches.length === 0) {
        return `⏱ No timezone found for "${place}". Try a city name like \`London\`, \`Tokyo\`, or a region like \`America/New_York\`.\n\nUse \`/time list\` to browse available timezones.`;
      }

      // Handle the special "list" keyword to show available regions
      if (query === 'list') {
        return this.listTimezones(timezones);
      }

      // If there's an exact match, use it; otherwise use the first match
      const bestMatch =
        matches.find((tz) => tz.toLowerCase() === query) ||
        matches.find((tz) => tz.toLowerCase().endsWith(`/${query}`)) ||
        matches[0];

      const timeRes = await fetch(`${this.apiBase}/timezone/${bestMatch}`);
      if (!timeRes.ok) {
        return `⏱ Could not fetch time data for "${bestMatch}". Please try again later.`;
      }
      const data = await timeRes.json();

      return this.formatTimeResponse(data, bestMatch, matches.length > 1 ? matches : null);
    } catch (err) {
      return `⏱ Error looking up time: ${err.message}`;
    }
  }

  /**
   * Format the time API response into a readable message
   */
  formatTimeResponse(data, timezone, otherMatches) {
    const dt = new Date(data.datetime);
    const timeStr = dt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const dateStr = dt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let response = `🕐 **${timezone}**\n`;
    response += `**Time:** ${timeStr}\n`;
    response += `**Date:** ${dateStr}\n`;
    response += `**UTC Offset:** ${data.utc_offset}`;

    if (data.abbreviation) {
      response += ` (${data.abbreviation})`;
    }

    if (otherMatches && otherMatches.length > 1) {
      const others = otherMatches
        .filter((m) => m !== timezone)
        .slice(0, 5)
        .map((m) => `\`${m}\``)
        .join(', ');
      response += `\n\n_Other matches: ${others}_`;
    }

    return response;
  }

  /**
   * List available timezone regions
   */
  listTimezones(timezones) {
    const regions = {};
    for (const tz of timezones) {
      const region = tz.split('/')[0];
      if (!regions[region]) regions[region] = 0;
      regions[region]++;
    }

    let response = `🌍 **Available Timezone Regions**\n\n`;
    for (const [region, count] of Object.entries(regions).sort()) {
      response += `• **${region}** (${count} zones)\n`;
    }
    response += `\nUse \`/time <city>\` to look up a specific location, e.g. \`/time Tokyo\``;
    return response;
  }

  /**
   * Get plugin help text
   * @returns {string} Help text
   */
  getHelp() {
    return `**Time Plugin v${this.version}**

Available commands:
• \`/time <place>\` - Get the current time for a city or timezone
• \`/time list\` - Browse available timezone regions

Examples:
• \`/time London\` - Current time in London
• \`/time America/New_York\` - Current time in New York
• \`/time Tokyo\` - Current time in Tokyo`;
  }

  async initialize() {
    console.log(`Time plugin v${this.version} initialized`);
  }

  async cleanup() {
    console.log('Time plugin cleaned up');
  }
}
