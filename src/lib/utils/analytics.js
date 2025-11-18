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
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.messageType - Type of message (text, file, etc.)
 * @param {boolean} params.hasAttachments - Whether message has attachments
 */
export function trackMessageSent({ conversationId, messageType = 'text', hasAttachments = false }) {
	trackGoal('message_sent', {
		conversation_id: conversationId,
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
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.conversationType - Type of conversation
 */
export function trackConversationDeleted({ conversationId, conversationType }) {
	trackGoal('conversation_deleted', {
		conversation_id: conversationId,
		conversation_type: conversationType
	});
}

/**
 * Track conversation archiving
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {boolean} params.isArchiving - Whether archiving (true) or unarchiving (false)
 */
export function trackConversationArchived({ conversationId, isArchiving }) {
	trackGoal(isArchiving ? 'conversation_archived' : 'conversation_unarchived', {
		conversation_id: conversationId
	});
}

/**
 * Track file upload
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.fileType - MIME type of the file
 * @param {number} params.fileSize - Size of the file in bytes
 * @param {number} params.fileCount - Number of files uploaded
 */
export function trackFileUploaded({ conversationId, fileType, fileSize, fileCount = 1 }) {
	trackGoal('file_uploaded', {
		conversation_id: conversationId,
		file_type: fileType,
		file_size: fileSize,
		file_count: fileCount
	});
}

/**
 * Track voice call initiation
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.targetUserId - The user being called
 * @param {string} params.callType - Type of call (voice, video)
 */
export function trackCallStarted({ conversationId, targetUserId, callType = 'voice' }) {
	trackGoal('call_started', {
		conversation_id: conversationId,
		target_user_id: targetUserId,
		call_type: callType
	});
}

/**
 * Track call acceptance
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.callType - Type of call (voice, video)
 */
export function trackCallAccepted({ conversationId, callType = 'voice' }) {
	trackGoal('call_accepted', {
		conversation_id: conversationId,
		call_type: callType
	});
}

/**
 * Track call ending
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.callType - Type of call (voice, video)
 * @param {number} params.duration - Call duration in seconds
 */
export function trackCallEnded({ conversationId, callType = 'voice', duration = 0 }) {
	trackGoal('call_ended', {
		conversation_id: conversationId,
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
 * @param {Object} params
 * @param {string} params.conversationId - The conversation ID
 * @param {number} params.duration - Duration in seconds (0 for disabled)
 */
export function trackDisappearingMessagesConfigured({ conversationId, duration }) {
	trackGoal('disappearing_messages_configured', {
		conversation_id: conversationId,
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
 * @param {Object} params
 * @param {string} params.groupId - The group ID
 * @param {string} params.method - How they joined (invite_code, link, etc.)
 */
export function trackGroupJoined({ groupId, method = 'invite_code' }) {
	trackGoal('group_joined', {
		group_id: groupId,
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