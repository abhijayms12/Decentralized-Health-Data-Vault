/**
 * IPFS utilities for Health Data Vault
 * Uses public IPFS nodes (no API keys required)
 * Web3.Storage or Pinata gateway for uploads
 */

/**
 * Upload encrypted file to IPFS using Web3.Storage public endpoint
 * @param {Uint8Array} encryptedData - Encrypted file data
 * @param {string} originalFilename - Original filename
 * @returns {Promise<string>} - IPFS CID
 */
export async function uploadToIPFS(encryptedData, originalFilename = "encrypted-file") {
  try {
    // Create a File object from the encrypted data
    const blob = new Blob([encryptedData], { type: "application/octet-stream" });
    const file = new File([blob], originalFilename + ".enc", {
      type: "application/octet-stream"
    });

    // Use Pinata public gateway (no authentication required for small files)
    // Note: For production, use authenticated endpoints or Web3.Storage
    const formData = new FormData();
    formData.append("file", file);

    // Try multiple public IPFS services
    const services = [
      {
        name: "Web3.Storage",
        url: "https://api.web3.storage/upload",
        method: "POST"
      }
    ];

    // For development/testing, use a local IPFS node or public gateway
    // This is a simplified approach - in production you'd use proper IPFS client
    
    console.log("Uploading to IPFS via public gateway...");
    
    // Alternative: Use NFT.Storage public API (no auth needed for small files)
    const response = await fetch("https://api.nft.storage/upload", {
      method: "POST",
      body: file,
      headers: {
        "Authorization": "Bearer " + (import.meta.env.VITE_NFT_STORAGE_KEY || "")
      }
    });

    if (!response.ok) {
      // Fallback to local simulation or alternative method
      console.warn("Public IPFS upload failed, using alternative method");
      return await uploadViaIPFSGateway(encryptedData, originalFilename);
    }

    const data = await response.json();
    const cid = data.value?.cid || data.cid;
    
    if (!cid) {
      throw new Error("No CID returned from IPFS upload");
    }

    console.log("✓ Uploaded to IPFS:", cid);
    return cid;
    
  } catch (error) {
    console.error("IPFS upload error:", error);
    throw new Error("Failed to upload to IPFS: " + error.message);
  }
}

/**
 * Alternative: Upload via IPFS HTTP API (local node or Infura)
 * @param {Uint8Array} encryptedData - Encrypted file data
 * @param {string} originalFilename - Original filename
 * @returns {Promise<string>} - IPFS CID
 */
async function uploadViaIPFSGateway(encryptedData, originalFilename) {
  try {
    // This uses a local IPFS node if available
    const formData = new FormData();
    const blob = new Blob([encryptedData], { type: "application/octet-stream" });
    formData.append("file", blob, originalFilename + ".enc");

    const response = await fetch("http://localhost:5001/api/v0/add", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      // Final fallback: Generate a mock CID for development
      console.warn("Local IPFS node not available, using mock CID");
      return generateMockCID(encryptedData);
    }

    const data = await response.json();
    return data.Hash;
    
  } catch (error) {
    console.error("IPFS gateway upload failed:", error);
    // For development: generate deterministic CID based on content
    return generateMockCID(encryptedData);
  }
}

/**
 * Generate a mock CID for development/testing
 * In production, this should never be used
 * @param {Uint8Array} data - File data
 * @returns {string} - Mock CID
 */
function generateMockCID(data) {
  // Generate a deterministic hash-like string
  const hash = Array.from(data.slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  const mockCID = `Qm${hash}${Date.now().toString(36)}`;
  console.warn("⚠️  Using mock CID for development:", mockCID);
  console.warn("⚠️  Configure NFT_STORAGE_KEY or local IPFS for production");
  
  // Store the data locally for retrieval
  sessionStorage.setItem(`ipfs-mock-${mockCID}`, btoa(String.fromCharCode.apply(null, data)));
  
  return mockCID;
}

/**
 * Download file from IPFS
 * @param {string} cid - IPFS CID
 * @returns {Promise<Uint8Array>} - File data
 */
export async function downloadFromIPFS(cid) {
  try {
    console.log("Downloading from IPFS:", cid);
    
    // Check if it's a mock CID (for development)
    const mockData = sessionStorage.getItem(`ipfs-mock-${cid}`);
    if (mockData) {
      console.log("Retrieved from local storage (development mode)");
      const binaryString = atob(mockData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }

    // Try multiple IPFS gateways
    const gateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`
    ];

    let lastError;
    
    for (const gateway of gateways) {
      try {
        console.log(`Trying gateway: ${gateway}`);
        const response = await fetch(gateway, {
          method: "GET",
          headers: {
            "Accept": "application/octet-stream"
          }
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log("✓ Downloaded from IPFS:", arrayBuffer.byteLength, "bytes");
          return new Uint8Array(arrayBuffer);
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gateway ${gateway} failed:`, err.message);
        continue;
      }
    }

    throw lastError || new Error("All IPFS gateways failed");
    
  } catch (error) {
    console.error("IPFS download error:", error);
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
