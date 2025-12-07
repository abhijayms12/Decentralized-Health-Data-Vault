const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// TODO: Write a function uploadFile(filePath) that:
// 1. Uploads a file to Pinata using axios + REST API.
// 2. Uses .env keys (PINATA_API_KEY, PINATA_SECRET_API_KEY).
// 3. Returns ONLY the CID.
// 4. Does NOT use any deprecated Pinata or IPFS SDK.
// 5. Must catch and log errors cleanly.

/**
 * Upload a file to Pinata IPFS using REST API
 * @param {string} filePath - Absolute path to the file to upload
 * @returns {Promise<string>} - IPFS CID of the uploaded file
 */
async function uploadFile(filePath) {
  try {
    // Validate environment variables
    const apiKey = process.env.PINATA_API_KEY;
    const secretApiKey = process.env.PINATA_SECRET_API_KEY;

    if (!apiKey || !secretApiKey) {
      throw new Error("Missing Pinata API credentials in .env file");
    }

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the file
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    // Create form data
    const formData = new FormData();
    formData.append("file", fileStream);

    // Optional: Add metadata
    const metadata = JSON.stringify({
      name: fileName,
    });
    formData.append("pinataMetadata", metadata);

    // Optional: Add pinning options
    const options = JSON.stringify({
      cidVersion: 1,
    });
    formData.append("pinataOptions", options);

    // Upload to Pinata
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        maxBodyLength: Infinity,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretApiKey,
        },
      }
    );

    // Extract and return CID
    const cid = response.data.IpfsHash;
    console.log(`File uploaded successfully. CID: ${cid}`);
    return cid;

  } catch (error) {
    // Clean error handling
    if (error.response) {
      // Pinata API error
      console.error("Pinata API Error:", error.response.data);
      throw new Error(`Pinata upload failed: ${error.response.data.error || error.response.statusText}`);
    } else if (error.request) {
      // Network error
      console.error("Network Error:", error.message);
      throw new Error("Network error while uploading to Pinata");
    } else {
      // Other errors
      console.error("Upload Error:", error.message);
      throw error;
    }
  }
}

/**
 * Upload JSON data directly to Pinata
 * @param {object} jsonData - JSON object to upload
 * @param {string} name - Optional name for the JSON file
 * @returns {Promise<string>} - IPFS CID of the uploaded JSON
 */
async function uploadJSON(jsonData, name = "data.json") {
  try {
    const apiKey = process.env.PINATA_API_KEY;
    const secretApiKey = process.env.PINATA_SECRET_API_KEY;

    if (!apiKey || !secretApiKey) {
      throw new Error("Missing Pinata API credentials in .env file");
    }

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: jsonData,
        pinataMetadata: {
          name: name,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretApiKey,
        },
      }
    );

    const cid = response.data.IpfsHash;
    console.log(`JSON uploaded successfully. CID: ${cid}`);
    return cid;

  } catch (error) {
    if (error.response) {
      console.error("Pinata API Error:", error.response.data);
      throw new Error(`Pinata JSON upload failed: ${error.response.data.error || error.response.statusText}`);
    } else if (error.request) {
      console.error("Network Error:", error.message);
      throw new Error("Network error while uploading JSON to Pinata");
    } else {
      console.error("Upload Error:", error.message);
      throw error;
    }
  }
}

module.exports = {
  uploadFile,
  uploadJSON,
};
