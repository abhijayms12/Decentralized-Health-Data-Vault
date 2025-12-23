/**
 * Client-side decryption utilities for Health Data Vault
 * Uses Web Crypto API (AES-GCM) to match encryption.js
 * FIXED: Now compatible with encryption.js (was using incompatible CryptoJS before)
 */

/**
 * Decrypt encrypted file data using Web Crypto API (AES-GCM)
 * @param {Uint8Array} encryptedData - Combined IV + encrypted data
 * @param {CryptoKey} key - Web Crypto API key from encryption.js
 * @returns {Promise<Blob>} - Decrypted content as Blob
 */
export async function decryptFile(encryptedData, key) {
  try {
    if (!key) {
      throw new Error("Encryption key not provided");
    }

    // Extract IV (first 12 bytes) and encrypted data
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    // Decrypt using Web Crypto API
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );
    
    // Return as Blob for download
    return new Blob([decryptedData]);
    
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error(`Failed to decrypt file: ${error.message}`);
  }
}

/**
 * Decrypt and download file
 * @param {Uint8Array} encryptedData - Combined IV + encrypted data
 * @param {CryptoKey} key - Web Crypto API key
 * @param {string} filename - Name for downloaded file
 */
export async function decryptAndDownload(encryptedData, key, filename = "decrypted-file") {
  try {
    const blob = await decryptFile(encryptedData, key);
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Download error:", error.message);
    throw error;
  }
}

/**
 * Decrypt file and get data URL for preview
 * @param {Uint8Array} encryptedData - Combined IV + encrypted data
 * @param {CryptoKey} key - Web Crypto API key
 * @returns {Promise<string>} - Data URL for preview
 */
export async function decryptForPreview(encryptedData, key) {
  try {
    const blob = await decryptFile(encryptedData, key);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
  } catch (error) {
    console.error("Preview error:", error.message);
    throw error;
  }
}
