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
   * @param {string} messagePreview - Preview of the message content
   * @returns {Promise<Object>} Result object with success status and details
   */
  async notifyInactiveParticipants(conversationId, senderName, messagePreview) {
  	try {
  		// Validate inputs
  		this.validateInputs(conversationId, senderName, messagePreview);
 
  		console.log('📨 [SMS-SERVICE] Starting SMS notification process:', {
  			conversationId,
  			senderName,
  			messagePreview: messagePreview.substring(0, 50) + '...'
  		});
 
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
          const smsMessage = this.formatNotificationMessage(senderName, messagePreview);
          
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
            this.formatNotificationMessage(senderName, messagePreview),
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
   * @param {string} messagePreview - Preview of the message content
   * @returns {string} Formatted SMS message
   */
  formatNotificationMessage(senderName, messagePreview) {
    const sender = senderName?.trim() || 'Someone';
    const preview = messagePreview?.trim() || 'sent you a message';
    
    // Truncate preview to fit SMS length limits (160 chars total)
    const maxPreviewLength = 120 - sender.length;
    const truncatedPreview = preview.length > maxPreviewLength 
      ? `${preview.substring(0, maxPreviewLength - 3)}...`
      : preview;

    return `${sender}: ${truncatedPreview}`;
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
   * @param {string} messagePreview - Message preview
   * @throws {Error} If validation fails
   */
  validateInputs(conversationId, senderName, messagePreview) {
    if (!conversationId?.trim()) {
      throw new Error('Conversation ID is required');
    }
    if (!senderName?.trim()) {
      throw new Error('Sender name is required');
    }
    if (!messagePreview?.trim()) {
      throw new Error('Message preview is required');
    }
  }
}

/**
 * Supabase Auth SMS Provider
 * Uses Supabase Auth to send SMS messages (leverages existing Twilio integration)
 */
export class SupabaseAuthSMSProvider {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('Supabase client is required');
    }
    this.supabase = supabase;
  }

  /**
   * Send SMS using Supabase Auth
   * Note: This is a workaround since Supabase Auth doesn't have a direct SMS API
   * In production, you might want to use Twilio directly or another SMS service
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {string} message - SMS message content
   * @returns {Promise<Object>} Result with success status and message ID
   */
  async sendSMS(phoneNumber, message) {
    // For now, we'll use a custom SMS endpoint that leverages the existing SMS infrastructure
    // This could be enhanced to use Twilio directly or another SMS service
    
    // Use absolute URL to avoid SvelteKit fetch issues in server context
    // WebSocket server runs on PORT (8081), but SvelteKit dev server runs on different port
    const svelteKitPort = '5173'; // SvelteKit default dev server port
    const port = process.env.NODE_ENV === 'production'
      ? (process.env.PORT || '8080')
      : svelteKitPort;
    const baseUrl = process.env.NODE_ENV === 'production'
      ? (process.env.SITE_URL || 'https://qrypt.chat')
      : `http://localhost:${port}`;
    const smsUrl = `${baseUrl}/api/sms/send-notification`;
    
    console.log('📱 [SMS-PROVIDER] Attempting SMS API call:', {
      smsUrl,
      port,
      environment: process.env.NODE_ENV || 'development'
    });
    
    const response = await fetch(smsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phoneNumber,
        message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send SMS');
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.messageId
    };
  }
}

/**
 * Create SMS notification service instance
 * @param {Object} supabase - Supabase client
 * @returns {SMSNotificationService} Configured SMS notification service
 */
export function createSMSNotificationService(supabase) {
  const smsProvider = new SupabaseAuthSMSProvider(supabase);
  return new SMSNotificationService(supabase, smsProvider);
}