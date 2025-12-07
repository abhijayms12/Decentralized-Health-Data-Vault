const CryptoJS = require("crypto-js");
const fs = require("fs");
require("dotenv").config();

// TODO: Implement two functions:
// encryptFile(inputPath, outputPath) → writes encrypted file.
// decryptContent(encryptedText) → returns Buffer.
// Use AES via crypto-js.
// Do not modify other filesystem logic.

/**
 * Encrypt a file using AES encryption
 * @param {string} inputPath - Path to the file to encrypt
 * @param {string} outputPath - Path where encrypted file will be saved
 * @returns {Promise<void>}
 */
async function encryptFile(inputPath, outputPath) {
  try {
    // Get encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY not found in .env file");
    }

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Read the file as binary
    const fileBuffer = fs.readFileSync(inputPath);
    
    // Convert buffer to base64 for encryption
    const fileBase64 = fileBuffer.toString("base64");
    
    // Encrypt the content using AES
    const encrypted = CryptoJS.AES.encrypt(fileBase64, encryptionKey).toString();
    
    // Write encrypted content to output file
    fs.writeFileSync(outputPath, encrypted, "utf8");
    
    console.log(`File encrypted successfully: ${outputPath}`);
  } catch (error) {
    console.error("Encryption error:", error.message);
    throw error;
  }
}

/**
 * Decrypt encrypted content and return as Buffer
 * @param {string} encryptedText - The encrypted text string
 * @returns {Buffer} - Decrypted content as Buffer
 */
function decryptContent(encryptedText) {
  try {
    // Get encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY not found in .env file");
    }

    // Decrypt the content using AES
    const decrypted = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
    
    // Convert decrypted content to UTF8 string (base64)
    const decryptedBase64 = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedBase64) {
      throw new Error("Decryption failed - invalid key or corrupted data");
    }
    
    // Convert base64 back to Buffer
    const buffer = Buffer.from(decryptedBase64, "base64");
    
    return buffer;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw error;
  }
}

/**
 * Decrypt a file and save to output path
 * @param {string} inputPath - Path to encrypted file
 * @param {string} outputPath - Path where decrypted file will be saved
 * @returns {Promise<void>}
 */
async function decryptFile(inputPath, outputPath) {
  try {
    // Read encrypted file
    const encryptedText = fs.readFileSync(inputPath, "utf8");
    
    // Decrypt content
    const decryptedBuffer = decryptContent(encryptedText);
    
    // Write decrypted content to output file
    fs.writeFileSync(outputPath, decryptedBuffer);
    
    console.log(`File decrypted successfully: ${outputPath}`);
  } catch (error) {
    console.error("File decryption error:", error.message);
    throw error;
  }
}

module.exports = {
  encryptFile,
  decryptContent,
  decryptFile,
};
