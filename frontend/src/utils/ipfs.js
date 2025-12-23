/**
 * IPFS utilities for Health Data Vault
 * Uses Lighthouse for permanent IPFS storage
 * https://lighthouse.storage
 */

/**
 * Upload encrypted file to IPFS using Lighthouse
 * @param {Uint8Array} encryptedData - Encrypted file data
 * @param {string} originalFilename - Original filename
 * @returns {Promise<string>} - IPFS CID
 */
export async function uploadToIPFS(encryptedData, originalFilename = "encrypted-file") {
  const apiKey = import.meta.env.VITE_LIGHTHOUSE_API_KEY;
  
  if (!apiKey) {
    console.warn("⚠️  Lighthouse API key not found - using mock IPFS");
    return generateMockCID(encryptedData);
  }

  try {
    console.log("📤 Uploading to Lighthouse IPFS...");
    console.log("   File:", originalFilename + ".enc");
    console.log("   Size:", encryptedData.length, "bytes");
    
    // Create FormData with the file
    const formData = new FormData();
    const blob = new Blob([encryptedData], { type: "application/octet-stream" });
    const file = new File([blob], originalFilename + ".enc", {
      type: "application/octet-stream"
    });
    formData.append("file", file);

    // Upload to Lighthouse
    const response = await fetch("https://node.lighthouse.storage/api/v0/add", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Lighthouse upload failed:", response.status, errorText);
      console.warn("Falling back to mock IPFS");
      return generateMockCID(encryptedData);
    }

    const data = await response.json();
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
 * @param {Uint8Array} data - File data
 * @returns {string} - Mock CID
 * 
 * ⚠️ WARNING: Mock IPFS stores files in browser sessionStorage
 * - Files are LOST when browser closes or tab is refreshed
 * - NOT suitable for production use
 * - For persistent storage, implement Express backend with Lighthouse/Pinata
 * - TODO: Replace with backend API endpoint (see .github/copilot-instructions.md)
 */
function generateMockCID(data) {
  const hash = Array.from(data.slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  const mockCID = `Qm${hash}${Date.now().toString(36)}mock`;
  
  console.warn("⚠️  USING MOCK IPFS - FILES WILL BE LOST ON BROWSER RESTART");
  console.warn("   Mock CID:", mockCID);
  console.warn("   Storage: Browser sessionStorage (temporary)");
  console.warn("   Action: Set up Express backend for persistent storage");
  
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  sessionStorage.setItem(`ipfs-mock-${mockCID}`, btoa(binary));
  
  return mockCID;
}

/**
 * Download file from IPFS
 * @param {string} cid - IPFS CID
 * @returns {Promise<Uint8Array>} - File data
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
      
      // Decode from base64
      const binaryString = atob(stored);
      const data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }
      
      console.log("✅ Retrieved from mock storage:", data.length, "bytes");
      return data;
    }
    
    // Try multiple IPFS gateways
    const gateways = [
      `https://gateway.lighthouse.storage/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`
    ];

    let lastError;
    
    for (const gateway of gateways) {
      try {
        console.log(`Trying: ${gateway}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout
        
        const response = await fetch(gateway, {
          method: "GET",
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log("✅ Downloaded from IPFS:", arrayBuffer.byteLength, "bytes");
          return new Uint8Array(arrayBuffer);
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gateway ${gateway} failed:`, err.message);
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
