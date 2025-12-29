/**
 * Shared encryption utilities using a single key for all users
 * This allows doctors to decrypt patient files using the same shared key
 */

import CryptoJS from 'crypto-js';

// Get shared encryption key from environment variable
const SHARED_ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

console.log('🔑 Encryption key loaded:', SHARED_ENCRYPTION_KEY ? `${SHARED_ENCRYPTION_KEY.substring(0, 10)}...` : 'NOT FOUND');

if (!SHARED_ENCRYPTION_KEY) {
  console.warn('⚠️ VITE_ENCRYPTION_KEY not set in .env - encryption/decryption will fail');
}

/**
 * Encrypt file data using shared AES key
 * @param {ArrayBuffer} fileData - File data as ArrayBuffer
 * @returns {string} - Base64 encoded encrypted data
 */
export function encryptFileShared(fileData) {
  try {
    if (!SHARED_ENCRYPTION_KEY) {
      throw new Error('Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file');
    }

    // Convert ArrayBuffer to Base64
    const uint8Array = new Uint8Array(fileData);
    const binaryString = String.fromCharCode.apply(null, uint8Array);
    const base64Data = btoa(binaryString);
    
    // Encrypt using AES
    const encrypted = CryptoJS.AES.encrypt(base64Data, SHARED_ENCRYPTION_KEY).toString();
    
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt file: ' + error.message);
  }
}

/**
 * Decrypt file data using shared AES key
 * @param {string|Uint8Array} encryptedData - Encrypted data (string or Uint8Array from IPFS)
 * @returns {Blob} - Decrypted file as Blob
 */
export function decryptFileShared(encryptedData) {
  try {
    console.log('🔓 Starting decryption...');
    console.log('📦 Encrypted data type:', typeof encryptedData);
    console.log('📦 Encrypted data length:', encryptedData?.length || 'N/A');
    console.log('🔑 Key available:', !!SHARED_ENCRYPTION_KEY);
    
    if (!SHARED_ENCRYPTION_KEY) {
      throw new Error('Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file');
    }

    // Convert Uint8Array to string if needed (from IPFS download)
    let encryptedString;
    if (encryptedData instanceof Uint8Array) {
      console.log('🔄 Converting Uint8Array to string...');
      const decoder = new TextDecoder('utf-8');
      encryptedString = decoder.decode(encryptedData);
    } else {
      encryptedString = encryptedData;
    }

    console.log('📝 Encrypted string length:', encryptedString.length);

    // Decrypt using AES
    const decrypted = CryptoJS.AES.decrypt(encryptedString, SHARED_ENCRYPTION_KEY);
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    
    console.log('🔓 Decrypted text length:', decryptedText?.length || 0);
    
    if (!decryptedText) {
      throw new Error('Decryption failed - wrong key or corrupted data');
    }
    
    // Convert Base64 back to Blob
    const binaryString = atob(decryptedText);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return new Blob([bytes], { type: 'application/pdf' });
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt file. Ensure you have the correct encryption key in your .env file');
  }
}

/**
 * Check if shared encryption key is configured
 * @returns {boolean}
 */
export function isEncryptionConfigured() {
  return !!SHARED_ENCRYPTION_KEY;
}
