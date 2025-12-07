import CryptoJS from "crypto-js";

// TODO: Write decryptFile(encryptedText) using AES decryption
// with ENCRYPTION_KEY.
// Output must be a Blob for rendering or download.

/**
 * Decrypt encrypted text using AES and return as Blob
 * @param {string} encryptedText - The encrypted text string
 * @param {string} encryptionKey - The encryption key (optional, defaults to env)
 * @returns {Blob} - Decrypted content as Blob
 */
export function decryptFile(encryptedText, encryptionKey = null) {
  try {
    // Use provided key or get from environment
    // Note: In production, the key should be managed securely
    // and never hardcoded in frontend code
    const key = encryptionKey || import.meta.env.VITE_ENCRYPTION_KEY;
    
    if (!key) {
      throw new Error("Encryption key not provided");
    }

    // Decrypt the content using AES
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key);
    
    // Convert decrypted content to UTF8 string (base64)
    const decryptedBase64 = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedBase64) {
      throw new Error("Decryption failed - invalid key or corrupted data");
    }
    
    // Convert base64 to binary string
    const binaryString = atob(decryptedBase64);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create and return Blob
    return new Blob([bytes]);
    
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error(`Failed to decrypt file: ${error.message}`);
  }
}

/**
 * Decrypt and download file
 * @param {string} encryptedText - The encrypted text
 * @param {string} filename - Name for downloaded file
 * @param {string} encryptionKey - Optional encryption key
 */
export function decryptAndDownload(encryptedText, filename = "decrypted-file", encryptionKey = null) {
  try {
    const blob = decryptFile(encryptedText, encryptionKey);
    
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
 * @param {string} encryptedText - The encrypted text
 * @param {string} encryptionKey - Optional encryption key
 * @returns {Promise<string>} - Data URL for preview
 */
export async function decryptForPreview(encryptedText, encryptionKey = null) {
  try {
    const blob = decryptFile(encryptedText, encryptionKey);
    
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
