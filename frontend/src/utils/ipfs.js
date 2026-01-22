/**
 * IPFS utilities for Health Data Vault
 * Uses Lighthouse for permanent IPFS storage
 * https://lighthouse.storage
 */

/**
 * Upload encrypted file to IPFS using Lighthouse
 * @param {string} encryptedData - Encrypted file data (CryptoJS encrypted string)
 * @param {string} originalFilename - Original filename
 * @returns {Promise<string>} - IPFS CID
 */
export async function uploadToIPFS(encryptedData, originalFilename = "encrypted-file") {
  const apiKey = import.meta.env.VITE_LIGHTHOUSE_API_KEY;
  
  console.log("📤 Upload - Encrypted data type:", typeof encryptedData);
  console.log("📤 Upload - Encrypted data length:", encryptedData?.length);
  
  if (!apiKey) {
    console.warn("⚠️  Lighthouse API key not found - using mock IPFS");
    return generateMockCID(encryptedData);
  }

  try {
    console.log("📤 Uploading to Lighthouse IPFS...");
    console.log("   File:", originalFilename + ".enc");
    console.log("   Size:", encryptedData.length, "bytes");
    console.log("   API Key (first 10 chars):", apiKey.substring(0, 10));
    
    // Create FormData with the file
    const formData = new FormData();
    const blob = new Blob([encryptedData], { type: "text/plain" });
    const file = new File([blob], originalFilename + ".enc", {
      type: "text/plain"
    });
    formData.append("file", file);

    // Upload to Lighthouse using Files API (try multiple endpoints)
    const endpoints = [
      "https://node.lighthouse.storage/api/v0/add",
      "https://upload.lighthouse.storage/api/v0/add",
      "https://api.lighthouse.storage/api/v0/add"
    ];
    
    let response;
    let lastError;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`   Trying endpoint: ${endpoint}`);
        
        // Use fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json"
          },
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log(`   ✅ Connected to ${endpoint}`);
          break;
        } else {
          console.warn(`   ❌ ${endpoint} returned status ${response.status}`);
          lastError = new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`   ❌ ${endpoint} timed out`);
          lastError = new Error('Connection timeout');
        } else {
          console.warn(`   ❌ ${endpoint} failed:`, err.message);
          lastError = err;
        }
        continue;
      }
    }
    
    if (!response || !response.ok) {
      throw lastError || new Error("All Lighthouse endpoints failed");
    }

    const data = await response.json();
    console.log("📦 Lighthouse response:", data);
    const cid = data.Hash || data.cid || data.IpfsHash;
    
    if (!cid) {
      console.error("❌ No CID in response:", data);
      console.warn("Falling back to mock IPFS");
      return generateMockCID(encryptedData);
    }

    console.log("✅ Uploaded to Lighthouse IPFS successfully");
    console.log("   CID:", cid);
    return cid;
    
  } catch (error) {
    console.error("❌ Upload to Lighthouse failed:", error.message);
    console.warn("⚠️  Using mock IPFS fallback");
    return generateMockCID(encryptedData);
  }
}

/**
 * Generate a mock CID for development
 * @param {string} data - Encrypted file data (CryptoJS string)
 * @returns {string} - Mock CID
 * 
 * ⚠️ WARNING: Mock IPFS stores files in browser sessionStorage
 * - Files are LOST when browser closes or tab is refreshed
 * - NOT suitable for production use
 * - For persistent storage, implement Express backend with Lighthouse/Pinata
 * - TODO: Replace with backend API endpoint (see .github/copilot-instructions.md)
 */
function generateMockCID(data) {
  console.log("📦 Mock storage - Data type:", typeof data);
  
  // Generate hash from first chars of the encrypted string
  const hashSource = typeof data === 'string' ? data : String(data);
  const hash = hashSource.slice(0, 16)
    .split('')
    .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  
  const mockCID = `Qm${hash}${Date.now().toString(36)}mock`;
  
  console.warn("⚠️  USING MOCK IPFS - FILES WILL BE LOST ON BROWSER RESTART");
  console.warn("   Mock CID:", mockCID);
  console.warn("   Storage: Browser sessionStorage (temporary)");
  console.warn("   Action: Set up Express backend for persistent storage");
  
  // Store the encrypted string directly (it's already text from CryptoJS)
  sessionStorage.setItem(`ipfs-mock-${mockCID}`, data);
  
  return mockCID;
}

/**
 * Download file from IPFS
 * @param {string} cid - IPFS CID
 * @returns {Promise<Uint8Array|string>} - File data (Uint8Array from real IPFS, string from mock storage)
 */
export async function downloadFromIPFS(cid) {
  try {
    console.log("📥 Downloading from IPFS:", cid);
    
    // Check if this is a mock CID stored in sessionStorage
    if (cid.includes("mock")) {
      console.warn("⚠️  Mock CID detected - retrieving from browser storage");
      const stored = sessionStorage.getItem(`ipfs-mock-${cid}`);
      
      if (!stored) {
        throw new Error("Mock file not found in session storage. Files are lost when browser restarts. Use real IPFS (Lighthouse with backend) for persistent storage.");
      }
      
      console.log("📦 Retrieved from mock storage - Data type:", typeof stored, "Length:", stored.length);
      // Return the string directly (no base64 decoding needed anymore)
      return stored;
    }
    
    // Try multiple IPFS gateways
    const gateways = [
      `https://gateway.lighthouse.storage/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`
    ];

    let lastError;
    
    for (const gateway of gateways) {
      try {
        console.log(`Trying: ${gateway}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sec timeout per gateway
        
        const response = await fetch(gateway, {
          method: "GET",
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log("✅ Downloaded from IPFS:", arrayBuffer.byteLength, "bytes");
          return new Uint8Array(arrayBuffer);
        } else {
          console.warn(`Gateway returned status ${response.status}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`Gateway ${gateway} timed out`);
          lastError = new Error('Gateway timeout');
        } else {
          console.warn(`Gateway ${gateway} failed:`, err.message);
          lastError = err;
        }
        continue;
      }
    }

    throw lastError || new Error("All IPFS gateways failed. File may not be available yet (IPFS propagation takes time)");
    
  } catch (error) {
    console.error("❌ IPFS download error:", error);
    throw new Error("Failed to download from IPFS: " + error.message);
  }
}

/**
 * Get IPFS gateway URL for a CID
 * @param {string} cid - IPFS CID
 * @returns {string} - Gateway URL
 */
export function getIPFSGatewayURL(cid) {
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}
