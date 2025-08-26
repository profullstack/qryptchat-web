/**
 * @fileoverview SMS Notification Service for Inactive Users
 * Sends SMS notifications to users who are inactive when they receive new messages
 */

/**
 * SMS Notification Service
 * Handles sending SMS notifications to inactive users when they receive messages
 */
export class SMSNotificationService {
  /**
   * @param {Object} supabase - Supabase client instance
   * @param {Object} smsProvider - SMS provider instance (Supabase Auth or custom)
   */
  constructor(supabase, smsProvider) {
    if (!supabase) {
      throw new Error('Supabase client is required');
    }
    if (!smsProvider) {
      throw new Error('SMS provider is required');
    }

    this.supabase = supabase;
    this.smsProvider = smsProvider;
  }

  /**
   * Send SMS notifications to inactive participants in a conversation
   * @param {string} conversationId - The conversation ID
   * @param {string} senderName - Name of the message sender
   * @returns {Promise<Object>} Result object with success status and details
   */
  async notifyInactiveParticipants(conversationId, senderName) {
  	try {
  		// Validate inputs
  		this.validateInputs(conversationId, senderName);
 
  		console.log('📨 [SMS-SERVICE] Starting SMS notification process:', {
  			conversationId,
  			senderName
  		});

  		// Get conversation details for the notification
  		const { data: conversation, error: conversationError } = await this.supabase
  			.from('conversations')
  			.select('name, type')
  			.eq('id', conversationId)
  			.single();

  		if (conversationError) {
  			console.error('📨 [SMS-SERVICE] Failed to get conversation details:', conversationError);
  			throw new Error(`Failed to get conversation details: ${conversationError.message}`);
  		}
 
  		// Get inactive participants for this conversation
  		console.log('📨 [SMS-SERVICE] Calling get_inactive_participants function...');
  		const { data: inactiveParticipants, error: dbError } = await this.supabase.rpc(
  			'get_inactive_participants',
  			{ conversation_uuid: conversationId }
  		);
 
  		console.log('📨 [SMS-SERVICE] Database function result:', {
  			hasData: !!inactiveParticipants,
  			dataLength: inactiveParticipants?.length || 0,
  			hasError: !!dbError,
  			error: dbError
  		});
 
  		if (dbError) {
  			console.error('📨 [SMS-SERVICE] Database error:', dbError);
  			throw new Error(`Database error: ${dbError.message}`);
  		}

      if (!inactiveParticipants || inactiveParticipants.length === 0) {
        return {
          success: true,
          notificationsSent: 0,
          details: [],
          message: 'No inactive participants found'
        };
      }

      // Send SMS notifications to each inactive participant
      const notificationResults = [];
      let successCount = 0;

      for (const participant of inactiveParticipants) {
        try {
          const smsMessage = this.formatNotificationMessage(senderName, conversation, conversationId);
          
          // Send SMS using the provider
          const smsResult = await this.smsProvider.sendSMS(
            participant.phone_number,
            smsMessage
          );

          // Log the notification attempt
          await this.logNotification(
            participant.user_id,
            conversationId,
            participant.phone_number,
            smsMessage,
            true,
            smsResult.messageId || null
          );

          notificationResults.push({
            userId: participant.user_id,
            phoneNumber: participant.phone_number,
            displayName: participant.display_name,
            success: true,
            messageId: smsResult.messageId
          });

          successCount++;

        } catch (smsError) {
          // Log failed notification attempt
          await this.logNotification(
            participant.user_id,
            conversationId,
            participant.phone_number,
            this.formatNotificationMessage(senderName, conversation, conversationId),
            false,
            null,
            smsError.message
          );

          notificationResults.push({
            userId: participant.user_id,
            phoneNumber: participant.phone_number,
            displayName: participant.display_name,
            success: false,
            error: smsError.message
          });
        }
      }

      return {
        success: true,
        notificationsSent: successCount,
        totalParticipants: inactiveParticipants.length,
        details: notificationResults
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        notificationsSent: 0,
        details: []
      };
    }
  }

  /**
   * Format the SMS notification message
   * @param {string} senderName - Name of the message sender
   * @param {Object} conversation - Conversation details
   * @param {string} conversationId - Conversation ID for the link
   * @returns {string} Formatted SMS message
   */
  formatNotificationMessage(senderName, conversation, conversationId) {
    const sender = senderName?.trim() || 'Someone';
    const conversationName = conversation?.name?.trim();
    
    // Get the base URL for the chat link
    const baseUrl = process.env.SITE_URL || 'https://qrypt.chat';
    const chatLink = `${baseUrl}/chats/${conversationId}`;
    
    // Create a generic notification message with conversation context and direct link
    if (conversationName && conversation.type === 'group') {
      return `${sender} sent a message in "${conversationName}"\n\nOpen: ${chatLink}`;
    } else if (conversationName) {
      return `${sender} sent you a message in "${conversationName}"\n\nOpen: ${chatLink}`;
    } else if (conversation?.type === 'group') {
      return `${sender} sent a message in a group chat\n\nOpen: ${chatLink}`;
    } else {
      return `${sender} sent you a message\n\nOpen: ${chatLink}`;
    }
  }

  /**
   * Log SMS notification attempt to database
   * @param {number} userId - User ID who received the notification
   * @param {string} conversationId - Conversation ID
   * @param {string} phoneNumber - Phone number where SMS was sent
   * @param {string} message - SMS message content
   * @param {boolean} success - Whether the SMS was sent successfully
   * @param {string|null} messageId - SMS provider message ID
   * @param {string|null} errorMessage - Error message if failed
   */
  async logNotification(userId, conversationId, phoneNumber, message, success, messageId = null, errorMessage = null) {
    try {
      await this.supabase.rpc('log_sms_notification', {
        user_uuid: userId,
        conversation_uuid: conversationId,
        message_uuid: null, // We don't have message UUID in this context
        phone: phoneNumber,
        content: message,
        notification_status: success ? 'sent' : 'failed',
        error_msg: errorMessage
      });
    } catch (error) {
      // Don't throw here - logging failures shouldn't break the main flow
      console.error('Failed to log SMS notification:', error);
    }
  }

  /**
   * Validate input parameters
   * @param {string} conversationId - Conversation ID
   * @param {string} senderName - Sender name
   * @throws {Error} If validation fails
   */
  validateInputs(conversationId, senderName) {
    if (!conversationId?.trim()) {
      throw new Error('Conversation ID is required');
    }
    if (!senderName?.trim()) {
      throw new Error('Sender name is required');
    }
  }
}

/**
 * Create SMS notification service instance
 * @param {Object} supabase - Supabase client
 * @returns {Promise<SMSNotificationService>} Configured SMS notification service
 */
export async function createSMSNotificationService(supabase) {
  // Import TwilioSMSProvider dynamically to avoid import issues
  const { TwilioSMSProvider } = await import('./twilio-sms-provider.js');
  const smsProvider = new TwilioSMSProvider();
  return new SMSNotificationService(supabase, smsProvider);
}