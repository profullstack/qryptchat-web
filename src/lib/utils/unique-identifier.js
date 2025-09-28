/**
 * Unique Identifier Utilities
 * 
 * Provides functions for generating, validating, and formatting unique user identifiers
 * that are used for profile sharing and chat initiation.
 * 
 * Format: QC + 8 alphanumeric characters (excluding O and 0 for clarity)
 * Example: QCA1B2C3D4
 */

// Character set: 0-9 and A-Z (including 0 and O as requested)
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PREFIX = 'qryptchat';
const IDENTIFIER_LENGTH = 17; // qryptchat + 8 characters
const BODY_LENGTH = 8;

/**
 * Generate a new unique identifier
 * @returns {string} A unique identifier in format qryptchat + 8 characters
 */
export function generateUniqueIdentifier() {
    let result = PREFIX;
    
    for (let i = 0; i < BODY_LENGTH; i++) {
        const randomIndex = Math.floor(Math.random() * CHARS.length);
        result += CHARS[randomIndex];
    }
    
    return result;
}

/**
 * Validate a unique identifier format
 * @param {string|null|undefined} identifier - The identifier to validate
 * @returns {boolean} True if the identifier is valid
 */
export function validateUniqueIdentifier(identifier) {
    // Handle null, undefined, or non-string values
    if (!identifier || typeof identifier !== 'string') {
        return false;
    }
    
    // Trim whitespace
    const trimmed = identifier.trim();
    
    // Check length
    if (trimmed.length !== IDENTIFIER_LENGTH) {
        return false;
    }
    
    // Check prefix
    if (!trimmed.startsWith(PREFIX)) {
        return false;
    }
    
    // Check character set (0-9 and A-Z only)
    const body = trimmed.slice(PREFIX.length);
    const validPattern = /^[0-9A-Z]{8}$/;
    
    if (!validPattern.test(body)) {
        return false;
    }
    
    return true;
}

/**
 * Format a unique identifier for display (no formatting, just return as-is)
 * @param {string|null|undefined} identifier - The identifier to format
 * @returns {string} Identifier as-is (no special characters)
 */
export function formatUniqueIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
        return identifier || '';
    }
    
    const trimmed = identifier.trim();
    
    // Only return if it's a valid identifier, otherwise return as-is
    if (!validateUniqueIdentifier(trimmed)) {
        return trimmed;
    }
    
    // Return as-is (no formatting with dashes)
    return trimmed;
}

/**
 * Parse a user input identifier back to its original format
 * @param {string|null|undefined} userInput - The user input identifier to parse
 * @returns {string} Original identifier format or empty string if invalid
 */
export function parseUniqueIdentifier(userInput) {
    if (!userInput || typeof userInput !== 'string') {
        return '';
    }
    
    // Normalize: trim, remove any spaces, dashes, underscores
    const cleaned = userInput.trim().replace(/[-\s_]/g, '');
    
    // Handle case where it starts with qryptchat (case insensitive)
    const prefixMatch = cleaned.match(/^qryptchat/i);
    if (prefixMatch) {
        const body = cleaned.slice(prefixMatch[0].length).toUpperCase();
        return PREFIX + body;
    }
    
    // If it doesn't start with qryptchat, return cleaned and normalized
    return cleaned.toUpperCase();
}

/**
 * Generate a shareable URL for a user profile using their unique identifier
 * @param {string} identifier - The unique identifier
 * @param {string} baseUrl - The base URL of the application
 * @returns {string} Shareable profile URL
 */
export function generateShareableProfileUrl(identifier, baseUrl = '') {
    if (!validateUniqueIdentifier(identifier)) {
        throw new Error('Invalid unique identifier');
    }
    
    const cleanBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    return `${cleanBaseUrl}/id/${identifier}`;
}

/**
 * Extract unique identifier from a shareable URL
 * @param {string} url - The shareable URL
 * @returns {string|null} The unique identifier or null if not found
 */
export function extractIdentifierFromUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    
    // Match pattern /id/QCXXXXXXXX
    const match = url.match(/\/id\/([A-Z0-9]{10})$/i);
    if (!match) {
        return null;
    }
    
    const identifier = match[1].toUpperCase();
    return validateUniqueIdentifier(identifier) ? identifier : null;
}

/**
 * Create a user-friendly display version of the identifier
 * @param {string} identifier - The unique identifier
 * @returns {string} User-friendly display format
 */
export function createDisplayIdentifier(identifier) {
    if (!validateUniqueIdentifier(identifier)) {
        return identifier || '';
    }
    
    return formatUniqueIdentifier(identifier);
}

/**
 * Check if two identifiers are the same (case-insensitive, format-agnostic)
 * @param {string} id1 - First identifier
 * @param {string} id2 - Second identifier
 * @returns {boolean} True if identifiers match
 */
export function identifiersMatch(id1, id2) {
    const parsed1 = parseUniqueIdentifier(id1);
    const parsed2 = parseUniqueIdentifier(id2);
    
    return Boolean(parsed1 && parsed2 && parsed1 === parsed2);
}