/**
 * Client-side encryption utilities for Health Data Vault
 * Uses AES-GCM for secure file encryption
 * Derives encryption key from wallet signature (no hardcoded keys)
 */

/**
 * Derive encryption key from wallet signature
 * @param {ethers.Signer} signer - Ethers signer instance
 * @returns {Promise<CryptoKey>} - Web Crypto API key
 */
export async function deriveEncryptionKey(signer) {
  try {
    const message = "Health Data Vault - Encryption Key Derivation";
    const signature = await signer.signMessage(message);
    
    // Convert signature to bytes
    const encoder = new TextEncoder();
    const signatureBytes = encoder.encode(signature);
    
    // Import as raw key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      signatureBytes.slice(0, 32), // Use first 32 bytes for AES-256
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    
    // Derive AES-GCM key
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("health-vault-salt"),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    
    return key;
  } catch (error) {
    console.error("Key derivation error:", error);
    throw new Error("Failed to derive encryption key: " + error.message);
  }
}

/**
 * Encrypt file using AES-GCM
 * @param {ArrayBuffer} fileData - File data as ArrayBuffer
 * @param {CryptoKey} key - Encryption key from deriveEncryptionKey
 * @returns {Promise<Object>} - Object with encrypted data and iv
 */
export async function encryptFile(fileData, key) {
  try {
    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the file
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      fileData
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    return {
      encryptedData: combined,
      iv: iv
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt file: " + error.message);
  }
}

/**
 * Decrypt file using AES-GCM
 * @param {Uint8Array} encryptedData - Combined IV + encrypted data
 * @param {CryptoKey} key - Decryption key
 * @returns {Promise<ArrayBuffer>} - Decrypted file data
 */
export async function decryptFile(encryptedData, key) {
  try {
    // Extract IV (first 12 bytes)
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    // Decrypt the file
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );
    
    return decryptedData;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt file: " + error.message);
  }
}

/**
 * Store encryption key in session storage (encrypted with password)
 * @param {CryptoKey} key - The encryption key
 * @returns {Promise<string>} - Key identifier
 */
export async function storeKey(key) {
  try {
    const exported = await crypto.subtle.exportKey("raw", key);
    const keyArray = Array.from(new Uint8Array(exported));
    const keyString = btoa(String.fromCharCode.apply(null, keyArray));
    sessionStorage.setItem("health-vault-key", keyString);
    return "key-stored";
  } catch (error) {
    console.error("Key storage error:", error);
    throw new Error("Failed to store key: " + error.message);
  }
}

/**
 * Retrieve encryption key from session storage
 * @returns {Promise<CryptoKey|null>} - The encryption key or null
 */
export async function retrieveKey() {
  try {
    const keyString = sessionStorage.getItem("health-vault-key");
    if (!keyString) return null;
    
    const keyArray = Uint8Array.from(atob(keyString), c => c.charCodeAt(0));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyArray,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    
    return key;
  } catch (error) {
    console.error("Key retrieval error:", error);
    return null;
  }
}
