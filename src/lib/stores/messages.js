/**
 * @fileoverview Message store for managing global application messages
 * Handles info, warning, error, and success messages across the app
 */

import { writable } from 'svelte/store';

/**
 * @typedef {Object} Message
 * @property {string} id - Unique message ID
 * @property {'info' | 'warning' | 'error' | 'success'} type - Message type
 * @property {string} message - Message content
 * @property {string} [title] - Optional message title
 * @property {boolean} [dismissible] - Whether message can be dismissed
 * @property {number} [autoDismiss] - Auto-dismiss after milliseconds (0 = no auto-dismiss)
 * @property {number} timestamp - When message was created
 */

/**
 * @type {import('svelte/store').Writable<Message[]>}
 */
const messagesStore = writable([]);

/**
 * Generate unique ID for messages
 * @returns {string}
 */
function generateId() {
	return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Message store with methods for managing messages
 */
function createMessageStore() {
	const { subscribe, set, update } = messagesStore;

	return {
		subscribe,

		/**
		 * Add a new message
		 * @param {'info' | 'warning' | 'error' | 'success'} type
		 * @param {string} message
		 * @param {Object} [options]
		 * @param {string} [options.title]
		 * @param {boolean} [options.dismissible=true]
		 * @param {number} [options.autoDismiss=0]
		 * @returns {string} Message ID
		 */
		add(type, message, options = {}) {
			const id = generateId();
			const newMessage = {
				id,
				type,
				message,
				title: options.title,
				dismissible: options.dismissible ?? true,
				autoDismiss: options.autoDismiss ?? 0,
				timestamp: Date.now()
			};

			update(messages => [...messages, newMessage]);
			return id;
		},

		/**
		 * Add info message
		 * @param {string} message
		 * @param {Object} [options]
		 * @returns {string} Message ID
		 */
		info(message, options = {}) {
			return this.add('info', message, options);
		},

		/**
		 * Add success message
		 * @param {string} message
		 * @param {Object} [options]
		 * @returns {string} Message ID
		 */
		success(message, options = {}) {
			return this.add('success', message, { autoDismiss: 5000, ...options });
		},

		/**
		 * Add warning message
		 * @param {string} message
		 * @param {Object} [options]
		 * @returns {string} Message ID
		 */
		warning(message, options = {}) {
			return this.add('warning', message, options);
		},

		/**
		 * Add error message
		 * @param {string} message
		 * @param {Object} [options]
		 * @returns {string} Message ID
		 */
		error(message, options = {}) {
			return this.add('error', message, options);
		},

		/**
		 * Remove a message by ID
		 * @param {string} id
		 */
		remove(id) {
			update(messages => messages.filter(msg => msg.id !== id));
		},

		/**
		 * Clear all messages
		 */
		clear() {
			set([]);
		},

		/**
		 * Clear messages of specific type
		 * @param {'info' | 'warning' | 'error' | 'success'} type
		 */
		clearType(type) {
			update(messages => messages.filter(msg => msg.type !== type));
		}
	};
}

// Export the message store
export const messages = createMessageStore();