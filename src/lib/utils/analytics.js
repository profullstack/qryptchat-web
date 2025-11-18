/**
 * Analytics utility for tracking user interactions with datafast
 * Provides a consistent interface for goal tracking across the application
 */

/**
 * Track a goal event with datafast
 * @param {string} goalName - The name of the goal/event
 * @param {Object} properties - Additional properties to track
 */
export function trackGoal(goalName, properties = {}) {
	try {
		if (typeof window !== 'undefined' && window.datafast) {
			window.datafast(goalName, properties);
		}
	} catch (error) {
		console.error('Failed to track goal:', goalName, error);
	}
}

/**
 * Track message sending
 * NOTE: Does not send conversationId or any private message data to protect user privacy
 * @param {Object} params
 * @param {string} params.messageType - Type of message (text, file, etc.)
 * @param {boolean} params.hasAttachments - Whether message has attachments
 */
export function trackMessageSent({ messageType = 'text', hasAttachments = false }) {
	trackGoal('message_sent', {
		message_type: messageType,
		has_attachments: hasAttachments
	});
}

/**
 * Track conversation creation
 * @param {Object} params
 * @param {string} params.conversationType - Type of conversation (direct, group, channel)
 * @param {number} params.participantCount - Number of participants
 */
export function trackConversationCreated({ conversationType, participantCount = 2 }) {
	trackGoal('conversation_created', {
		conversation_type: conversationType,
		participant_count: participantCount
	});
}

/**
 * Track conversation deletion
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {string} params.conversationType - Type of conversation
 */
export function trackConversationDeleted({ conversationType }) {
	trackGoal('conversation_deleted', {
		conversation_type: conversationType
	});
}

/**
 * Track conversation archiving
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {boolean} params.isArchiving - Whether archiving (true) or unarchiving (false)
 */
export function trackConversationArchived({ isArchiving }) {
	trackGoal(isArchiving ? 'conversation_archived' : 'conversation_unarchived', {});
}

/**
 * Track file upload
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {string} params.fileType - MIME type of the file
 * @param {number} params.fileSize - Size of the file in bytes
 * @param {number} params.fileCount - Number of files uploaded
 */
export function trackFileUploaded({ fileType, fileSize, fileCount = 1 }) {
	trackGoal('file_uploaded', {
		file_type: fileType,
		file_size: fileSize,
		file_count: fileCount
	});
}

/**
 * Track voice call initiation
 * NOTE: Does not send conversationId or targetUserId to protect user privacy
 * @param {Object} params
 * @param {string} params.callType - Type of call (voice, video)
 */
export function trackCallStarted({ callType = 'voice' }) {
	trackGoal('call_started', {
		call_type: callType
	});
}

/**
 * Track call acceptance
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {string} params.callType - Type of call (voice, video)
 */
export function trackCallAccepted({ callType = 'voice' }) {
	trackGoal('call_accepted', {
		call_type: callType
	});
}

/**
 * Track call ending
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {string} params.callType - Type of call (voice, video)
 * @param {number} params.duration - Call duration in seconds
 */
export function trackCallEnded({ callType = 'voice', duration = 0 }) {
	trackGoal('call_ended', {
		call_type: callType,
		duration
	});
}

/**
 * Track user authentication
 * @param {Object} params
 * @param {string} params.method - Authentication method (phone, email, etc.)
 * @param {boolean} params.isSignup - Whether this is a signup (true) or login (false)
 */
export function trackAuthentication({ method = 'phone', isSignup = false }) {
	trackGoal(isSignup ? 'user_signup' : 'user_login', {
		auth_method: method
	});
}

/**
 * Track user logout
 */
export function trackLogout() {
	trackGoal('user_logout', {});
}

/**
 * Track profile update
 * @param {Object} params
 * @param {Array<string>} params.fieldsUpdated - List of fields that were updated
 */
export function trackProfileUpdated({ fieldsUpdated = [] }) {
	trackGoal('profile_updated', {
		fields_updated: fieldsUpdated.join(',')
	});
}

/**
 * Track avatar upload
 */
export function trackAvatarUploaded() {
	trackGoal('avatar_uploaded', {});
}

/**
 * Track settings change
 * @param {Object} params
 * @param {string} params.settingName - Name of the setting changed
 * @param {string} params.settingValue - New value of the setting
 */
export function trackSettingChanged({ settingName, settingValue }) {
	trackGoal('setting_changed', {
		setting_name: settingName,
		setting_value: String(settingValue)
	});
}

/**
 * Track disappearing messages configuration
 * NOTE: Does not send conversationId to protect user privacy
 * @param {Object} params
 * @param {number} params.duration - Duration in seconds (0 for disabled)
 */
export function trackDisappearingMessagesConfigured({ duration }) {
	trackGoal('disappearing_messages_configured', {
		duration,
		enabled: duration > 0
	});
}

/**
 * Track theme change
 * @param {Object} params
 * @param {string} params.theme - The new theme (light, dark)
 */
export function trackThemeChanged({ theme }) {
	trackGoal('theme_changed', {
		theme
	});
}

/**
 * Track language change
 * @param {Object} params
 * @param {string} params.language - The new language code
 */
export function trackLanguageChanged({ language }) {
	trackGoal('language_changed', {
		language
	});
}

/**
 * Track group join
 * NOTE: Does not send groupId to protect user privacy
 * @param {Object} params
 * @param {string} params.method - How they joined (invite_code, link, etc.)
 */
export function trackGroupJoined({ method = 'invite_code' }) {
	trackGoal('group_joined', {
		join_method: method
	});
}

/**
 * Track encryption key reset
 * @param {Object} params
 * @param {string} params.resetType - Type of reset (complete, partial, etc.)
 */
export function trackKeyReset({ resetType = 'complete' }) {
	trackGoal('encryption_key_reset', {
		reset_type: resetType
	});
}

/**
 * Track PWA installation
 */
export function trackPWAInstalled() {
	trackGoal('pwa_installed', {});
}

/**
 * Track premium upgrade initiation
 */
export function trackPremiumUpgradeInitiated() {
	trackGoal('premium_upgrade_initiated', {});
}