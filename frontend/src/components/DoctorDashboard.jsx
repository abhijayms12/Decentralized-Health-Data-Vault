import { useState } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { decryptFile, decryptAndDownload } from "../utils/decrypt.js";

// TODO: Build a UI that:
// 1. Takes a patient address as input.
// 2. Calls getRecords(patientAddress).
// 3. Fetches files via https://gateway.pinata.cloud/ipfs/<CID>.
// 4. Displays decrypted files if needed.
// - Handle "Not authorized" errors gracefully.

export default function DoctorDashboard({ contract, account }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [decryptedFiles, setDecryptedFiles] = useState({});

  const handleFetchRecords = async (e) => {
    e.preventDefault();

    if (!ethers.isAddress(patientAddress)) {
      setMessage("Invalid patient address");
      return;
    }

    try {
      setLoading(true);
      setMessage("Fetching patient records...");
      setRecords([]);
      setDecryptedFiles({});

      // Call smart contract to get records
      const patientRecords = await contract.getRecords(patientAddress);
      
      setRecords(patientRecords);
      setMessage(`Found ${patientRecords.length} record(s)`);

    } catch (error) {
      console.error("Error fetching records:", error);
      
      // Handle "Not authorized" error gracefully
      if (error.message.includes("Not authorized")) {
        setMessage("You are not authorized to view this patient's records. The patient must grant you access first.");
      } else {
        setMessage(`Failed to fetch records: ${error.message}`);
      }
      
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewFile = async (cid, index) => {
    try {
      setMessage(`Fetching file from IPFS...`);
      
      // Fetch encrypted file from Pinata gateway
      const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        responseType: "text"
      });

      const encryptedContent = response.data;
      
      // Decrypt the file
      // Note: In production, the encryption key should be securely managed
      try {
        const blob = decryptFile(encryptedContent);
        const url = window.URL.createObjectURL(blob);
        
        // Store decrypted file URL
        setDecryptedFiles(prev => ({
          ...prev,
          [index]: url
        }));
        
        setMessage("File decrypted successfully");
        
        // Open in new tab
        window.open(url, "_blank");
        
      } catch (decryptError) {
        console.error("Decryption error:", decryptError);
        setMessage("File fetched but decryption failed. Opening encrypted version...");
        
        // If decryption fails, open the original file
        window.open(`https://gateway.pinata.cloud/ipfs/${cid}`, "_blank");
      }

    } catch (error) {
      console.error("Error viewing file:", error);
      setMessage(`Failed to fetch file: ${error.message}`);
    }
  };

  const handleDownloadFile = async (cid, index) => {
    try {
      setMessage(`Downloading file...`);
      
      // Fetch encrypted file from Pinata gateway
      const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        responseType: "text"
      });

      const encryptedContent = response.data;
      
      // Decrypt and download
      try {
        decryptAndDownload(encryptedContent, `health-record-${index + 1}`);
        setMessage("File downloaded successfully");
      } catch (decryptError) {
        console.error("Decryption error:", decryptError);
        setMessage("Decryption failed. Downloading encrypted version...");
        
        // If decryption fails, download the encrypted version
        const link = document.createElement("a");
        link.href = `https://gateway.pinata.cloud/ipfs/${cid}`;
        link.download = `health-record-${index + 1}-encrypted`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

    } catch (error) {
      console.error("Error downloading file:", error);
      setMessage(`Failed to download file: ${error.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Doctor Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-4 rounded ${message.includes("Failed") || message.includes("Invalid") || message.includes("not authorized") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {message}
        </div>
      )}

      {/* Patient Address Input */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Access Patient Records</h2>
        <form onSubmit={handleFetchRecords} className="flex gap-2">
          <input
            type="text"
            value={patientAddress}
            onChange={(e) => setPatientAddress(e.target.value)}
            placeholder="Enter patient's wallet address (0x...)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !patientAddress}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Fetch Records"}
          </button>
        </form>
        <p className="mt-2 text-sm text-gray-500">
          You can only access records for patients who have granted you permission
        </p>
      </div>

      {/* Records List */}
      {records.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">
            Patient Records ({records.length})
          </h2>
          
          <div className="space-y-4">
            {records.map((record, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Record #{index + 1}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">CID:</span> {record.cid}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Date:</span>{" "}
                      {new Date(Number(record.timestamp) * 1000).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Uploaded by:</span>{" "}
                      {record.uploader.substring(0, 6)}...{record.uploader.substring(38)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewFile(record.cid, index)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDownloadFile(record.cid, index)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to Access Records</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Request the patient to grant you access using your wallet address: <code className="bg-blue-100 px-1 rounded">{account}</code></li>
          <li>• Once granted, enter the patient's wallet address above</li>
          <li>• You will be able to view and download their health records</li>
          <li>• All files are encrypted and will be decrypted automatically when viewing</li>
        </ul>
      </div>
    </div>
  );
}
