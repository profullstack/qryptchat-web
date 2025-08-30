/**
 * @fileoverview Message cleanup service for removing expired disappearing messages
 * Handles per-user message expiration based on individual settings
 */

import { createServiceRoleClient } from '../supabase/service-role.js';

// Lazy service role client creation
let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

/**
 * Message cleanup service for handling expired disappearing messages
 */
export class MessageCleanupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.cleanupIntervalMs = 60000; // Run every minute
  }

  /**
   * Start the cleanup service
   */
  start() {
    if (this.isRunning) {
      console.log('🧹 Message cleanup service is already running');
      return;
    }

    console.log('🧹 Starting message cleanup service...');
    this.isRunning = true;

    // Run cleanup immediately
    this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.cleanupIntervalMs);

    console.log(`🧹 Message cleanup service started (interval: ${this.cleanupIntervalMs}ms)`);
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('🧹 Message cleanup service is not running');
      return;
    }

    console.log('🧹 Stopping message cleanup service...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('🧹 Message cleanup service stopped');
  }

  /**
   * Run the cleanup process
   * @private
   */
  async runCleanup() {
    try {
      console.log('🧹 Running message cleanup...');

      // Call the database function to clean up expired messages
      const { data, error } = await supabaseServiceRole
        .rpc('fn_cleanup_expired_messages');

      if (error) {
        console.error('🧹 ❌ Error during message cleanup:', error);
        return;
      }

      const deletedCount = data || 0;
      if (deletedCount > 0) {
        console.log(`🧹 ✅ Cleaned up ${deletedCount} expired message copies`);
      } else {
        console.log('🧹 ✅ No expired messages to clean up');
      }

    } catch (error) {
      console.error('🧹 ❌ Exception during message cleanup:', error);
    }
  }

  /**
   * Clean up expired messages for a specific user
   * @param {string} userId - The user ID to clean up messages for
   * @returns {Promise<number>} Number of messages cleaned up
   */
  async cleanupForUser(userId) {
    try {
      console.log(`🧹 Running cleanup for user: ${userId}`);

      const { data, error } = await supabaseServiceRole
        .rpc('fn_cleanup_expired_messages', { p_user_id: userId });

      if (error) {
        console.error(`🧹 ❌ Error cleaning up messages for user ${userId}:`, error);
        throw error;
      }

      const deletedCount = data || 0;
      console.log(`🧹 ✅ Cleaned up ${deletedCount} expired messages for user ${userId}`);
      return deletedCount;

    } catch (error) {
      console.error(`🧹 ❌ Exception cleaning up messages for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get cleanup service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.cleanupIntervalMs,
      hasInterval: this.intervalId !== null
    };
  }

  /**
   * Set cleanup interval
   * @param {number} intervalMs - Cleanup interval in milliseconds
   */
  setInterval(intervalMs) {
    if (intervalMs < 10000) {
      throw new Error('Cleanup interval must be at least 10 seconds');
    }

    this.cleanupIntervalMs = intervalMs;
    console.log(`🧹 Cleanup interval updated to ${intervalMs}ms`);

    // Restart if currently running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

// Create and export singleton instance
export const messageCleanupService = new MessageCleanupService();

// Auto-start the service in server environments
if (typeof window === 'undefined') {
  // Start the service after a short delay to allow for proper initialization
  setTimeout(() => {
    messageCleanupService.start();
  }, 5000);
}