/**
 * Quantum-resistant end-to-end encrypted chat using CRYSTALS-Kyber
 * This module handles the chat UI, WebSocket communication, and encryption/decryption
 */
import { MlKem768 } from 'https://esm.sh/crystals-kyber-js';

// Chat state
const chatState = {
  socket: null,
  keyPair: null,
  recipientPublicKey: null,
  sharedSecret: null,
  connected: false,
  username: null
};

// DOM elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  generateKeysButton: document.getElementById('generateKeysButton'),
  connectButton: document.getElementById('connectButton'),
  disconnectButton: document.getElementById('disconnectButton'),
  publicKeyDisplay: document.getElementById('publicKeyDisplay'),
  copyPublicKeyButton: document.getElementById('copyPublicKeyButton'),
  recipientPublicKey: document.getElementById('recipientPublicKey'),
  setRecipientKeyButton: document.getElementById('setRecipientKeyButton'),
  messagesContainer: document.getElementById('messagesContainer'),
  messageInput: document.getElementById('messageInput'),
  sendButton: document.getElementById('sendButton')
};

/**
 * Initialize the chat page
 */
function initChatPage() {
  // Check if user is logged in
  chatState.username = localStorage.getItem('username');
  
  // Set up event listeners
  elements.generateKeysButton.addEventListener('click', generateKeys);
  elements.connectButton.addEventListener('click', connect);
  elements.disconnectButton.addEventListener('click', disconnect);
  elements.copyPublicKeyButton.addEventListener('click', copyPublicKey);
  elements.setRecipientKeyButton.addEventListener('click', setRecipientKey);
  elements.sendButton.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  
  elements.recipientPublicKey.addEventListener('input', () => {
    elements.setRecipientKeyButton.disabled = !elements.recipientPublicKey.value.trim();
  });
  
  // Add system message
  addSystemMessage('Welcome to the quantum-resistant E2EE chat. Generate keys to begin.');
}

/**
 * Generate Kyber key pair
 */
async function generateKeys() {
  try {
    addSystemMessage('Generating Kyber key pair...');
    elements.generateKeysButton.disabled = true;
    
    // Generate key pair
    const kyber = new MlKem768();
    const keyPair = await kyber.keyPair();
    
    // Store key pair
    chatState.keyPair = keyPair;
    
    // Display public key
    const publicKeyBase64 = arrayBufferToBase64(keyPair.publicKey);
    elements.publicKeyDisplay.value = publicKeyBase64;
    
    // Enable buttons
    elements.copyPublicKeyButton.disabled = false;
    elements.connectButton.disabled = false;
    elements.setRecipientKeyButton.disabled = !elements.recipientPublicKey.value.trim();
    
    addSystemMessage('Key pair generated successfully. Share your public key with your chat partner.');
  } catch (error) {
    console.error('Error generating keys:', error);
    addSystemMessage(`Error generating keys: ${error.message}`);
    elements.generateKeysButton.disabled = false;
  }
}

/**
 * Copy public key to clipboard
 */
function copyPublicKey() {
  navigator.clipboard.writeText(elements.publicKeyDisplay.value)
    .then(() => {
      addSystemMessage('Public key copied to clipboard.');
    })
    .catch(error => {
      console.error('Error copying public key:', error);
      addSystemMessage(`Error copying public key: ${error.message}`);
    });
}

/**
 * Set recipient's public key
 */
async function setRecipientKey() {
  try {
    const recipientKeyBase64 = elements.recipientPublicKey.value.trim();
    if (!recipientKeyBase64) {
      addSystemMessage('Please enter the recipient\'s public key.');
      return;
    }
    
    // Convert base64 to ArrayBuffer
    chatState.recipientPublicKey = base64ToArrayBuffer(recipientKeyBase64);
    
    addSystemMessage('Recipient\'s public key set successfully.');
    
    // If we have both keys, enable connect button
    if (chatState.keyPair && chatState.recipientPublicKey) {
      elements.connectButton.disabled = false;
    }
  } catch (error) {
    console.error('Error setting recipient key:', error);
    addSystemMessage(`Error setting recipient key: ${error.message}`);
  }
}

/**
 * Connect to WebSocket server
 */
async function connect() {
  try {
    if (!chatState.keyPair || !chatState.recipientPublicKey) {
      addSystemMessage('Please generate keys and set recipient\'s public key first.');
      return;
    }
    
    // Get the current host and port
    const host = window.location.hostname;
    
    // Create the WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use port + 1 for WebSocket connections (the separate WebSocket server)
    const wsPort = parseInt(window.location.port || '80') + 1;
    const wsUrl = `${wsProtocol}//${host}:${wsPort}`;
    
    addSystemMessage(`Connecting to ${wsUrl}...`);
    
    // Create a new WebSocket connection
    chatState.socket = new WebSocket(wsUrl);
    
    // Connection opened
    chatState.socket.addEventListener('open', async (event) => {
      addSystemMessage('Connected to WebSocket server');
      updateConnectionStatus(true);
      
      // Perform key encapsulation
      await performKeyEncapsulation();
    });
    
    // Listen for messages
    chatState.socket.addEventListener('message', (event) => {
      handleIncomingMessage(event.data);
    });
    
    // Connection closed
    chatState.socket.addEventListener('close', (event) => {
      addSystemMessage(`Disconnected from server: ${event.reason || 'Connection closed'}`);
      updateConnectionStatus(false);
    });
    
    // Connection error
    chatState.socket.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
      addSystemMessage('WebSocket error occurred');
      updateConnectionStatus(false);
    });
  } catch (error) {
    console.error('Error connecting to WebSocket server:', error);
    addSystemMessage(`Error connecting: ${error.message}`);
  }
}

/**
 * Perform key encapsulation using Kyber
 */
async function performKeyEncapsulation() {
  try {
    addSystemMessage('Performing key encapsulation...');
    
    const kyber = new MlKem768();
    
    // Encapsulate using recipient's public key to generate a shared secret
    const { ciphertext, sharedSecret } = await kyber.encap(chatState.recipientPublicKey);
    
    // Store shared secret
    chatState.sharedSecret = sharedSecret;
    
    // Send ciphertext to recipient
    const ciphertextBase64 = arrayBufferToBase64(ciphertext);
    const message = {
      type: 'key_exchange',
      ciphertext: ciphertextBase64,
      username: chatState.username || 'Anonymous'
    };
    
    chatState.socket.send(JSON.stringify(message));
    addSystemMessage('Key exchange initiated');
  } catch (error) {
    console.error('Error during key encapsulation:', error);
    addSystemMessage(`Error during key exchange: ${error.message}`);
  }
}

/**
 * Handle incoming WebSocket messages
 * @param {string} data - Message data
 */
async function handleIncomingMessage(data) {
  try {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'key_exchange':
        await handleKeyExchange(message);
        break;
      case 'chat_message':
        await handleChatMessage(message);
        break;
      case 'system':
        addSystemMessage(message.content);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('Error handling incoming message:', error);
    addSystemMessage(`Error handling message: ${error.message}`);
  }
}

/**
 * Handle key exchange message
 * @param {Object} message - Key exchange message
 */
async function handleKeyExchange(message) {
  try {
    addSystemMessage(`Received key exchange from ${message.username}`);
    
    // Convert ciphertext from base64 to ArrayBuffer
    const ciphertext = base64ToArrayBuffer(message.ciphertext);
    
    // Perform key decapsulation
    const kyber = new MlKem768();
    const sharedSecret = await kyber.decap(ciphertext, chatState.keyPair.secretKey);
    
    // Store shared secret
    chatState.sharedSecret = sharedSecret;
    
    addSystemMessage('Key exchange completed successfully');
    
    // Enable chat functionality
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
  } catch (error) {
    console.error('Error handling key exchange:', error);
    addSystemMessage(`Error during key exchange: ${error.message}`);
  }
}

/**
 * Handle chat message
 * @param {Object} message - Chat message
 */
async function handleChatMessage(message) {
  try {
    if (!chatState.sharedSecret) {
      addSystemMessage('Cannot decrypt message: No shared secret established');
      return;
    }
    
    // Decrypt the message
    const { iv, ciphertext } = message.encrypted;
    const ivBuffer = base64ToArrayBuffer(iv);
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    
    const decrypted = await decryptMessage(ciphertextBuffer, ivBuffer);
    
    // Add message to chat
    addReceivedMessage(message.username, decrypted);
  } catch (error) {
    console.error('Error handling chat message:', error);
    addSystemMessage(`Error decrypting message: ${error.message}`);
  }
}

/**
 * Disconnect from WebSocket server
 */
function disconnect() {
  if (chatState.socket) {
    chatState.socket.close();
    chatState.socket = null;
  }
  
  // Reset state
  chatState.connected = false;
  chatState.sharedSecret = null;
  
  // Update UI
  updateConnectionStatus(false);
}

/**
 * Update connection status in UI
 * @param {boolean} connected - Connection status
 */
function updateConnectionStatus(connected) {
  chatState.connected = connected;
  
  elements.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
  elements.connectionStatus.className = connected ? 'connected' : 'disconnected';
  
  elements.connectButton.disabled = connected || !chatState.keyPair || !chatState.recipientPublicKey;
  elements.disconnectButton.disabled = !connected;
  elements.messageInput.disabled = !connected || !chatState.sharedSecret;
  elements.sendButton.disabled = !connected || !chatState.sharedSecret;
}

/**
 * Send a message
 */
async function sendMessage() {
  try {
    const message = elements.messageInput.value.trim();
    
    if (!message || !chatState.socket || !chatState.sharedSecret) {
      return;
    }
    
    // Encrypt the message
    const { ciphertext, iv } = await encryptMessage(message);
    
    // Convert to base64
    const ciphertextBase64 = arrayBufferToBase64(ciphertext);
    const ivBase64 = arrayBufferToBase64(iv);
    
    // Create message object
    const messageObj = {
      type: 'chat_message',
      username: chatState.username || 'You',
      encrypted: {
        ciphertext: ciphertextBase64,
        iv: ivBase64
      }
    };
    
    // Send message
    chatState.socket.send(JSON.stringify(messageObj));
    
    // Add message to chat
    addSentMessage(chatState.username || 'You', message);
    
    // Clear input
    elements.messageInput.value = '';
  } catch (error) {
    console.error('Error sending message:', error);
    addSystemMessage(`Error sending message: ${error.message}`);
  }
}

/**
 * Encrypt a message using AES-GCM with the shared secret
 * @param {string} message - Message to encrypt
 * @returns {Object} - Encrypted message and IV
 */
async function encryptMessage(message) {
  // Convert message to ArrayBuffer
  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Import shared secret as key
  const key = await crypto.subtle.importKey(
    'raw',
    chatState.sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Encrypt message
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    messageBuffer
  );
  
  return { ciphertext, iv };
}

/**
 * Decrypt a message using AES-GCM with the shared secret
 * @param {ArrayBuffer} ciphertext - Encrypted message
 * @param {ArrayBuffer} iv - Initialization vector
 * @returns {string} - Decrypted message
 */
async function decryptMessage(ciphertext, iv) {
  // Import shared secret as key
  const key = await crypto.subtle.importKey(
    'raw',
    chatState.sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt message
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  // Convert ArrayBuffer to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Add a sent message to the chat
 * @param {string} sender - Message sender
 * @param {string} content - Message content
 */
function addSentMessage(sender, content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message message-sent';
  messageElement.textContent = content;
  elements.messagesContainer.appendChild(messageElement);
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

/**
 * Add a received message to the chat
 * @param {string} sender - Message sender
 * @param {string} content - Message content
 */
function addReceivedMessage(sender, content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message message-received';
  messageElement.textContent = `${sender}: ${content}`;
  elements.messagesContainer.appendChild(messageElement);
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

/**
 * Add a system message to the chat
 * @param {string} content - Message content
 */
function addSystemMessage(content) {
  const messageElement = document.createElement('div');
  messageElement.className = 'message message-system';
  messageElement.textContent = content;
  elements.messagesContainer.appendChild(messageElement);
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer - ArrayBuffer to convert
 * @returns {string} - Base64 string
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64 - Base64 string to convert
 * @returns {ArrayBuffer} - ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Initialize the chat page
document.addEventListener('DOMContentLoaded', initChatPage);