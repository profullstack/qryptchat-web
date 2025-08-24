// Realtime subscription utilities for delivery tracking
// Handles disappearing message expiry events via Supabase Realtime

import { browser } from '$app/environment';
import { supabase } from '$lib/supabase.js';

/**
 * Subscribe to delivery changes for the current user
 * Listens for expired deliveries and triggers UI cleanup
 * @param {string} userId - Current user's ID
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onExpire - Called when a message expires for this user
 * @param {Function} callbacks.onRead - Called when a message is marked as read
 * @param {Function} callbacks.onDelivered - Called when a message is delivered
 * @returns {Function} Unsubscribe function
 */
export function subscribeDeliveriesForUser(userId, { onExpire, onRead, onDelivered } = {}) {
  if (!browser) return () => {};

  const channel = supabase.channel(`deliveries-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `recipient_user_id=eq.${userId}`
      },
      (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const row = newRow ?? oldRow;

        switch (eventType) {
          case 'INSERT':
            // New delivery created (message delivered)
            if (onDelivered && row.delivered_ts) {
              onDelivered(row.message_id, {
                deliveredAt: row.delivered_ts,
                expiresAt: row.expires_at
              });
            }
            break;

          case 'UPDATE':
            // Check if message was marked as read
            if (onRead && newRow.read_ts && !oldRow?.read_ts) {
              onRead(row.message_id, {
                readAt: newRow.read_ts,
                expiresAt: newRow.expires_at
              });
            }

            // Check if message expired (tombstoned)
            if (onExpire && newRow.deleted_ts && !oldRow?.deleted_ts) {
              onExpire(row.message_id, {
                deletedAt: newRow.deleted_ts,
                reason: newRow.deletion_reason
              });
            }
            break;

          case 'DELETE':
            // Delivery record deleted (shouldn't happen in normal flow)
            if (onExpire) {
              onExpire(row.message_id, {
                deletedAt: new Date().toISOString(),
                reason: 'deleted'
              });
            }
            break;
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to delivery changes for a specific conversation
 * Useful for real-time read receipts and delivery status
 * @param {string} conversationId - Conversation ID to monitor
 * @param {string} userId - Current user's ID
 * @param {Object} callbacks - Event callbacks
 * @returns {Function} Unsubscribe function
 */
export function subscribeConversationDeliveries(conversationId, userId, callbacks = {}) {
  if (!browser) return () => {};

  const channel = supabase.channel(`conversation-deliveries-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `recipient_user_id=eq.${userId}`
      },
      async (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const row = newRow ?? oldRow;

        // Verify this delivery belongs to our conversation
        if (row.message_id) {
          const { data: message } = await supabase
            .from('messages')
            .select('conversation_id')
            .eq('id', row.message_id)
            .single();

          if (message?.conversation_id === conversationId) {
            // Handle the delivery event for this conversation
            subscribeDeliveriesForUser(userId, callbacks);
          }
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Get active deliveries for a user
 * Used for initial load to filter out expired messages
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of active delivery records
 */
export async function getActiveDeliveries(userId) {
  try {
    const { data, error } = await supabase
      .rpc('fn_get_user_active_deliveries', { p_user_id: userId });

    if (error) {
      console.error('Error fetching active deliveries:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getActiveDeliveries:', error);
    return [];
  }
}

/**
 * Mark a message as read and start read-based timer if configured
 * @param {string} messageId - Message ID to mark as read
 * @returns {Promise<boolean>} Success status
 */
export async function markMessageAsRead(messageId) {
  try {
    const { error } = await supabase
      .rpc('fn_mark_read', { p_message_id: messageId });

    if (error) {
      console.error('Error marking message as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in markMessageAsRead:', error);
    return false;
  }
}

/**
 * Check if a message has expired for the current user
 * @param {string} messageId - Message ID to check
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if expired, false if still active
 */
export async function isMessageExpired(messageId, userId) {
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .select('deleted_ts')
      .eq('message_id', messageId)
      .eq('recipient_user_id', userId)
      .single();

    if (error) {
      // If no delivery record found, consider it expired
      return true;
    }

    return data?.deleted_ts !== null;
  } catch (error) {
    console.error('Error checking message expiry:', error);
    return true; // Fail safe - consider expired if we can't check
  }
}

/**
 * Utility to create a message expiry manager for a component
 * Handles automatic cleanup of expired messages from UI state
 * @param {Function} removeMessage - Function to remove message from UI
 * @returns {Object} Manager object with subscribe method
 */
export function createExpiryManager(removeMessage) {
  let unsubscribe = null;

  return {
    /**
     * Start monitoring expiry for a user
     * @param {string} userId - User ID to monitor
     */
    subscribe(userId) {
      if (unsubscribe) {
        unsubscribe();
      }

      unsubscribe = subscribeDeliveriesForUser(userId, {
        onExpire: (messageId, details) => {
          console.log(`Message ${messageId} expired:`, details);
          removeMessage(messageId);
        }
      });
    },

    /**
     * Stop monitoring and cleanup
     */
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}