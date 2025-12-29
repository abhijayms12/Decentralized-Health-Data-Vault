import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { encryptFileShared, decryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS, downloadFromIPFS } from "../utils/ipfs.js";

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
  const [downloadingCID, setDownloadingCID] = useState(null); // Track which file is downloading
  const [message, setMessage] = useState("");
  const [encryptionKey, setEncryptionKey] = useState(null);
  
  // Upload states
  const [uploadPatientAddress, setUploadPatientAddress] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recordType, setRecordType] = useState("prescription"); // prescription or consultation

  // Check if shared encryption key is configured
  useEffect(() => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    }
  }, []);

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
    if (!encryptionKey) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
      return;
    }

    try {
      setDownloadingCID(cid);
      setMessage(`Fetching file from IPFS (may take 30+ seconds)...`);
      
      // FIXED: Use IPFS utility with multiple gateway fallbacks
      const encryptedData = await downloadFromIPFS(cid);
      
      setMessage("Decrypting file...");
      
      // Decrypt using shared key
      const blob = decryptFileShared(encryptedData);
      const url = window.URL.createObjectURL(blob);
      
      setMessage("File decrypted successfully");
      
      // Open in new tab
      window.open(url, "_blank");
      
      // Clean up URL after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);

    } catch (error) {
      console.error("Error viewing file:", error);
      if (error.message.includes("Mock file not found")) {
        setMessage("⚠️ File not found - mock IPFS data is lost on browser restart. Upload files again.");
      } else if (error.message.includes("All IPFS gateways failed")) {
        setMessage("File not yet available on IPFS. IPFS propagation can take several minutes. Try again later.");
      } else {
        setMessage(`Failed to view file: ${error.message}`);
      }
    } finally {
      setDownloadingCID(null);
    }
  };

  const handleDownloadFile = async (cid, index) => {
    if (!encryptionKey) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
      return;
    }

    try {
      setDownloadingCID(cid);
      setMessage(`Downloading file from IPFS...`);
      
      // FIXED: Use IPFS utility
      const encryptedData = await downloadFromIPFS(cid);
      
      setMessage("Decrypting file...");
      
      // Decrypt using shared key
      const blob = decryptFileShared(encryptedData);
      
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `health-record-${index + 1}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setMessage("File downloaded successfully");

    } catch (error) {
      console.error("Error downloading file:", error);
      if (error.message.includes("Mock file not found")) {
        setMessage("⚠️ File not found - mock IPFS data is lost on browser restart.");
      } else {
        setMessage(`Failed to download file: ${error.message}`);
      }
    } finally {
      setDownloadingCID(null);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!validTypes.includes(file.type)) {
        setMessage("❌ Please select a PDF or image file (JPEG, PNG)");
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setMessage("❌ File size must be less than 10MB");
        return;
      }
      
      setSelectedFile(file);
      setMessage("");
    }
  };

  const handleUploadRecord = async (e) => {
    e.preventDefault();

    if (!ethers.isAddress(uploadPatientAddress)) {
      setMessage("❌ Invalid patient address");
      return;
    }

    if (!selectedFile) {
      setMessage("❌ Please select a file");
      return;
    }

    if (!encryptionKey) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
      return;
    }

    try {
      setUploading(true);
      setMessage(`📁 Reading file...`);

      // Read file
      const fileData = await selectedFile.arrayBuffer();
      
      setMessage("🔐 Encrypting file...");
      
      // Encrypt file using shared key
      const encryptedData = encryptFileShared(fileData);
      
      setMessage("📤 Uploading to IPFS...");
      
      // Upload to IPFS
      const filename = `${recordType}-${Date.now()}-${selectedFile.name}`;
      const cid = await uploadToIPFS(encryptedData, filename);
      
      setMessage("📝 Saving to blockchain...");
      
      // Add doctor record to blockchain
      const tx = await contract.addDoctorRecord(uploadPatientAddress, cid);
      
      setMessage("⏳ Waiting for confirmation...");
      await tx.wait();
      
      setMessage(`✅ ${recordType === 'prescription' ? 'Prescription' : 'Consultation record'} uploaded successfully! CID: ${cid}`);
      
      // Clear form
      setSelectedFile(null);
      setUploadPatientAddress("");
      if (document.getElementById("doctor-file-upload")) {
        document.getElementById("doctor-file-upload").value = "";
      }
      
    } catch (error) {
      console.error("Error uploading record:", error);
      
      if (error.message.includes("Not authorized")) {
        setMessage("❌ You are not authorized to upload records for this patient. The patient must grant you access first.");
      } else if (error.message.includes("user rejected")) {
        setMessage("❌ Transaction cancelled");
      } else {
        setMessage(`❌ Failed to upload record: ${error.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Doctor Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-4 rounded ${message.includes("Failed") || message.includes("Invalid") || message.includes("not authorized") || message.includes("❌") ? "bg-red-100 text-red-700" : message.includes("⚠️") ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
          {message}
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">📝 Upload Prescription/Consultation Record</h2>
        <form onSubmit={handleUploadRecord} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Patient Wallet Address
            </label>
            <input
              type="text"
              value={uploadPatientAddress}
              onChange={(e) => setUploadPatientAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Record Type
            </label>
            <select
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            >
              <option value="prescription">💊 Prescription</option>
              <option value="consultation">🩺 Consultation Record</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File (PDF or Image, max 10MB)
            </label>
            <input
              id="doctor-file-upload"
              type="file"
              accept=".pdf,image/jpeg,image/png,image/jpg"
              onChange={handleFileSelect}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={uploading || !selectedFile || !uploadPatientAddress}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {uploading ? "Uploading..." : `Upload ${recordType === 'prescription' ? 'Prescription' : 'Consultation Record'}`}
          </button>
        </form>
        <p className="mt-3 text-sm text-gray-500">
          ⚠️ You can only upload records for patients who have granted you doctor access
        </p>
      </div>

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
                      disabled={downloadingCID === record.cid}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadingCID === record.cid ? "Loading..." : "View"}
                    </button>
                    <button
                      onClick={() => handleDownloadFile(record.cid, index)}
                      disabled={downloadingCID === record.cid}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadingCID === record.cid ? "Downloading..." : "Download"}
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
