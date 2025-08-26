/**
 * @fileoverview Cross-device key synchronization service
 * Handles backup and restoration of encrypted keys across devices
 */

import { browser } from '$app/environment';
import { MasterKeyDerivation } from './master-key-derivation.js';
import { EncryptedKeyBackup } from './encrypted-key-backup.js';

/**
 * Key synchronization service
 * Manages cross-device key backup and restoration
 */
export class KeySyncService {
	/**
	 * Initialize key sync service
	 * @param {any} supabaseClient - Supabase client instance
	 */
	constructor(supabaseClient) {
		this.supabase = supabaseClient;
		this.isInitialized = false;
	}

	/**
	 * Initialize the service
	 */
	async initialize() {
		if (!browser) {
			console.warn('🔑 Key sync service only available in browser');
			return;
		}

		this.isInitialized = true;
		console.log('🔑 Key sync service initialized');
	}

	/**
	 * Backup user keys to encrypted cloud storage
	 * @param {Object} params - Backup parameters
	 * @param {string} params.phoneNumber - User's phone number
	 * @param {string} params.pin - User's PIN/password
	 * @param {{ publicKey: Uint8Array, privateKey: Uint8Array }} params.identityKeys - Identity key pair
	 * @param {Record<string, Uint8Array>} params.conversationKeys - Conversation keys
	 * @param {string} params.deviceFingerprint - Device identifier
	 * @returns {Promise<{ success: boolean, backupId?: string, error?: string }>} Backup result
	 */
	async backupKeys({
		phoneNumber,
		pin,
		identityKeys,
		conversationKeys,
		deviceFingerprint
	}) {
		try {
			if (!this.isInitialized) {
				throw new Error('Key sync service not initialized');
			}

			// Get current user
			const { data: { user }, error: userError } = await this.supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			// Derive master key from credentials
			const masterKey = await MasterKeyDerivation.deriveFromCredentials(phoneNumber, pin);

			// Create encrypted backup package
			const backup = await EncryptedKeyBackup.createBackup({
				identityKeys,
				conversationKeys,
				masterKey,
				phoneNumber,
				deviceFingerprint
			});

			// Prepare database record
			const backupRecord = {
				user_id: user.id,
				phone_number: phoneNumber,
				encrypted_identity_keys: backup.encryptedIdentityKeys.encryptedData,
				encrypted_master_key: backup.encryptedConversationKeys.encryptedData,
				salt: backup.salt,
				iterations: backup.iterations,
				key_version: backup.keyVersion,
				device_fingerprint: deviceFingerprint
			};

			// Store in database (upsert to handle updates)
			const { data, error } = await this.supabase
				.from('encrypted_key_backups')
				.upsert(backupRecord, { onConflict: 'user_id' })
				.select('id')
				.single();

			if (error) {
				throw new Error(`Database error: ${error.message}`);
			}

			// Log access
			await this.logKeyAccess({
				userId: user.id,
				deviceFingerprint,
				accessType: 'backup_created',
				success: true
			});

			// Clear sensitive data
			MasterKeyDerivation.secureClear(masterKey);

			console.log(`🔑 Successfully backed up keys for ${phoneNumber}`);
			return {
				success: true,
				backupId: data.id
			};

		} catch (error) {
			console.error('🔑 Failed to backup keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			
			// Log failed access
			try {
				const { data: { user } } = await this.supabase.auth.getUser();
				if (user) {
					await this.logKeyAccess({
						userId: user.id,
						deviceFingerprint,
						accessType: 'backup_created',
						success: false,
						errorMessage
					});
				}
			} catch (logError) {
				console.error('🔑 Failed to log access:', logError);
			}

			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Restore user keys from encrypted cloud storage
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - User's PIN/password
	 * @param {string} [deviceFingerprint] - Device identifier
	 * @returns {Promise<{ success: boolean, identityKeys?: any, conversationKeys?: any, error?: string }>} Restore result
	 */
	async restoreKeys(phoneNumber, pin, deviceFingerprint) {
		try {
			if (!this.isInitialized) {
				throw new Error('Key sync service not initialized');
			}

			// Get current user
			const { data: { user }, error: userError } = await this.supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			// Fetch backup from database
			const { data: backup, error } = await this.supabase
				.from('encrypted_key_backups')
				.select('*')
				.eq('user_id', user.id)
				.single();

			if (error || !backup) {
				throw new Error('No backup found for this user');
			}

			// Verify phone number matches
			if (backup.phone_number !== phoneNumber) {
				throw new Error('Phone number mismatch');
			}

			// Derive master key using stored salt
			const masterKey = await MasterKeyDerivation.deriveWithSalt(
				phoneNumber,
				pin,
				backup.salt,
				backup.iterations
			);

			// Reconstruct backup package
			const backupPackage = {
				encryptedIdentityKeys: {
					encryptedData: backup.encrypted_identity_keys,
					nonce: backup.encrypted_identity_keys.slice(-12) // Last 12 bytes as nonce
				},
				encryptedConversationKeys: {
					encryptedData: backup.encrypted_master_key,
					nonce: backup.encrypted_master_key.slice(-12) // Last 12 bytes as nonce
				},
				salt: backup.salt,
				iterations: backup.iterations,
				phoneNumber: backup.phone_number,
				deviceFingerprint: backup.device_fingerprint,
				keyVersion: backup.key_version
			};

			// Restore keys from backup
			const restored = await EncryptedKeyBackup.restoreFromBackup(backupPackage, masterKey);

			// Log successful access
			await this.logKeyAccess({
				userId: user.id,
				deviceFingerprint: deviceFingerprint || 'unknown',
				accessType: 'keys_restored',
				success: true
			});

			// Clear sensitive data
			MasterKeyDerivation.secureClear(masterKey);

			console.log(`🔑 Successfully restored keys for ${phoneNumber}`);
			return {
				success: true,
				identityKeys: restored.identityKeys,
				conversationKeys: restored.conversationKeys
			};

		} catch (error) {
			console.error('🔑 Failed to restore keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Log failed access
			try {
				const { data: { user } } = await this.supabase.auth.getUser();
				if (user) {
					await this.logKeyAccess({
						userId: user.id,
						deviceFingerprint: deviceFingerprint || 'unknown',
						accessType: 'keys_restored',
						success: false,
						errorMessage
					});
				}
			} catch (logError) {
				console.error('🔑 Failed to log access:', logError);
			}

			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Sync keys to a new device
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - User's PIN/password
	 * @param {string} newDeviceFingerprint - New device identifier
	 * @returns {Promise<{ success: boolean, identityKeys?: any, conversationKeys?: any, error?: string }>} Sync result
	 */
	async syncToNewDevice(phoneNumber, pin, newDeviceFingerprint) {
		try {
			// First restore keys
			const restoreResult = await this.restoreKeys(phoneNumber, pin, newDeviceFingerprint);
			
			if (!restoreResult.success) {
				return restoreResult;
			}

			// Log device sync
			const { data: { user } } = await this.supabase.auth.getUser();
			if (user) {
				await this.logKeyAccess({
					userId: user.id,
					deviceFingerprint: newDeviceFingerprint,
					accessType: 'keys_accessed',
					success: true
				});
			}

			console.log(`🔑 Successfully synced keys to new device: ${newDeviceFingerprint}`);
			return restoreResult;

		} catch (error) {
			console.error('🔑 Failed to sync to new device:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Check if user has a key backup
	 * @param {string} phoneNumber - User's phone number
	 * @returns {Promise<{ hasBackup: boolean, backupInfo?: any, error?: string }>} Backup status
	 */
	async checkBackupStatus(phoneNumber) {
		try {
			const { data: { user }, error: userError } = await this.supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			const { data: backup, error } = await this.supabase
				.from('encrypted_key_backups')
				.select('phone_number, key_version, created_at, updated_at, device_fingerprint')
				.eq('user_id', user.id)
				.single();

			if (error || !backup) {
				return { hasBackup: false };
			}

			return {
				hasBackup: true,
				backupInfo: {
					phoneNumber: backup.phone_number,
					keyVersion: backup.key_version,
					createdAt: backup.created_at,
					updatedAt: backup.updated_at,
					deviceFingerprint: backup.device_fingerprint,
					phoneMatches: backup.phone_number === phoneNumber
				}
			};

		} catch (error) {
			console.error('🔑 Failed to check backup status:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return {
				hasBackup: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Delete user's key backup
	 * @param {string} phoneNumber - User's phone number for verification
	 * @returns {Promise<{ success: boolean, error?: string }>} Delete result
	 */
	async deleteBackup(phoneNumber) {
		try {
			const { data: { user }, error: userError } = await this.supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			// Verify phone number first
			const { data: backup } = await this.supabase
				.from('encrypted_key_backups')
				.select('phone_number')
				.eq('user_id', user.id)
				.single();

			if (backup && backup.phone_number !== phoneNumber) {
				throw new Error('Phone number verification failed');
			}

			// Delete backup
			const { error } = await this.supabase
				.from('encrypted_key_backups')
				.delete()
				.eq('user_id', user.id);

			if (error) {
				throw new Error(`Database error: ${error.message}`);
			}

			console.log(`🔑 Successfully deleted backup for ${phoneNumber}`);
			return { success: true };

		} catch (error) {
			console.error('🔑 Failed to delete backup:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Log key access for security monitoring
	 * @param {Object} params - Log parameters
	 * @param {string} params.userId - User ID
	 * @param {string} params.deviceFingerprint - Device identifier
	 * @param {string} params.accessType - Type of access
	 * @param {boolean} params.success - Whether access was successful
	 * @param {string} [params.errorMessage] - Error message if failed
	 * @private
	 */
	async logKeyAccess({
		userId,
		deviceFingerprint,
		accessType,
		success,
		errorMessage
	}) {
		try {
			const logEntry = {
				user_id: userId,
				device_fingerprint: deviceFingerprint,
				access_type: accessType,
				success,
				error_message: errorMessage || null,
				ip_address: null, // Could be populated from request headers
				user_agent: browser ? navigator.userAgent : null
			};

			await this.supabase
				.from('key_access_log')
				.insert(logEntry);

		} catch (error) {
			console.error('🔑 Failed to log key access:', error);
			// Don't throw - logging failures shouldn't break main functionality
		}
	}

	/**
	 * Get user's key access history
	 * @param {number} limit - Number of records to fetch
	 * @returns {Promise<{ success: boolean, logs?: any[], error?: string }>} Access logs
	 */
	async getAccessHistory(limit = 50) {
		try {
			const { data: { user }, error: userError } = await this.supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			const { data: logs, error } = await this.supabase
				.from('key_access_log')
				.select('*')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(limit);

			if (error) {
				throw new Error(`Database error: ${error.message}`);
			}

			return {
				success: true,
				logs: logs || []
			};

		} catch (error) {
			console.error('🔑 Failed to get access history:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false,
				error: errorMessage
			};
		}
	}
}