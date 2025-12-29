import { useState } from "react";
import { ethers } from "ethers";
import { encryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS } from "../utils/ipfs";

export default function DiagnosticsDashboard({ contract, account }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [encryptionKey, setEncryptionKey] = useState(null);

  // Check if encryption key is configured
  const checkEncryptionKey = () => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      showMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    }
  };

  // Show message helper
  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 5000);
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type (PDF only)
    if (file.type !== "application/pdf") {
      showMessage("❌ Only PDF files are supported");
      event.target.value = "";
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showMessage("❌ File size must be less than 10MB");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    showMessage(`✓ Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
  };

  // Handle file upload with encryption
  const handleFileUpload = async (event) => {
    // Check encryption on first upload attempt
    if (!encryptionKey) {
      checkEncryptionKey();
      if (!encryptionKey) {
        return;
      }
    }

    if (!selectedFile) {
      showMessage("❌ Please select a file first");
      return;
    }

    if (!ethers.isAddress(patientAddress)) {
      showMessage("❌ Please enter a valid patient address");
      return;
    }

    // Prevent uploading to self
    if (patientAddress.toLowerCase() === account.toLowerCase()) {
      showMessage("❌ Cannot upload to your own address");
      return;
    }

    try {
      setUploading(true);
      showMessage("📋 Reading file...");

      // 1. Read file as ArrayBuffer
      const fileData = await readFileAsArrayBuffer(selectedFile);
      console.log("✓ File read:", fileData.byteLength, "bytes");

      // 2. Encrypt the file
      showMessage("🔐 Encrypting diagnostic report...");
      const encryptedData = encryptFileShared(fileData);
      console.log("✓ File encrypted");

      // 3. Upload to IPFS
      showMessage("📤 Uploading to IPFS...");
      const cid = await uploadToIPFS(encryptedData, selectedFile.name);
      console.log("✓ Uploaded to IPFS, CID:", cid);

      // 4. Store record on blockchain
      showMessage("⛓️ Recording on blockchain...");
      const tx = await contract.addDiagnosticRecord(patientAddress, cid);
      console.log("✓ Transaction sent:", tx.hash);
      
      showMessage("⏳ Waiting for confirmation...");
      await tx.wait();
      console.log("✓ Transaction confirmed");

      showMessage(`✅ Diagnostic report uploaded successfully! CID: ${cid.substring(0, 20)}...`);
      setSelectedFile(null);
      document.getElementById("diagnostic-upload").value = "";

    } catch (error) {
      console.error("Error uploading file:", error);
      
      let errorMsg = "❌ Upload failed: ";
      
      if (error.message.includes("No permission") || error.message.includes("has not granted")) {
        errorMsg = "❌ Patient has not granted you permission. Patient must visit their dashboard and grant Diagnostics Lab access first.";
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg = "❌ Transaction rejected by user";
      } else if (error.message.includes("Not authorized")) {
        errorMsg = "❌ You don't have permission to add records for this patient. Patient must grant access first.";
      } else {
        errorMsg += error.message;
      }
      
      showMessage(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  // Helper: Read file as ArrayBuffer
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Diagnostics Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-4 rounded font-semibold ${
          message.includes("❌") ? "bg-red-100 text-red-700" :
          message.includes("✅") ? "bg-green-100 text-green-700" :
          message.includes("⚠️") ? "bg-yellow-100 text-yellow-700" :
          "bg-blue-100 text-blue-700"
        }`}>
          {message}
        </div>
      )}

      {/* Patient Address Input */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Patient Information</h2>
        <input
          type="text"
          value={patientAddress}
          onChange={(e) => setPatientAddress(e.target.value)}
          placeholder="Enter patient's wallet address (0x...)"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-2 text-sm text-gray-500">
          ℹ️ The patient must grant you Diagnostics Lab access permission before you can upload reports
        </p>
      </div>

      {/* Encryption Key Warning */}
      {encryptionKey === null && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 font-semibold">
            ⚠️ Encryption Key Not Configured
          </p>
          <p className="text-yellow-700 text-sm mt-1">
            Add <code className="bg-yellow-100 px-1 rounded">VITE_ENCRYPTION_KEY</code> to your .env file for encrypted uploads
          </p>
        </div>
      )}

      {/* File Upload Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Diagnostic Report</h2>
        
        <div className="space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select PDF File
            </label>
            <input
              id="diagnostic-upload"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Selected File Display */}
          {selectedFile && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">
                ({(selectedFile.size / 1024).toFixed(2)} KB)
              </span>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleFileUpload}
            disabled={!selectedFile || uploading || !patientAddress || encryptionKey === null}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 
              disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition"
          >
            {uploading ? "Uploading..." : "🔐 Encrypt & Upload to Patient"}
          </button>

          {/* Help Text */}
          <div className="text-xs text-gray-600 space-y-1">
            <p>✓ Enter patient address first</p>
            <p>✓ Select PDF file (max 10MB)</p>
            <p>✓ Click upload to encrypt and send to patient's vault</p>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-3">📋 How It Works</h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start gap-2">
            <span>1️⃣</span>
            <span><strong>Enter Patient Address:</strong> Copy the patient's wallet address and paste it above</span>
          </li>
          <li className="flex items-start gap-2">
            <span>2️⃣</span>
            <span><strong>Patient Grants Permission:</strong> Patient must go to their dashboard and grant you "Diagnostics Lab Access"</span>
          </li>
          <li className="flex items-start gap-2">
            <span>3️⃣</span>
            <span><strong>Upload Report:</strong> Select PDF file and click "Encrypt & Upload" - file is encrypted automatically</span>
          </li>
          <li className="flex items-start gap-2">
            <span>4️⃣</span>
            <span><strong>Patient Sees Report:</strong> Patient can view and download the report from their "My Health Records" section</span>
          </li>
        </ul>
      </div>

      {/* Important Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Important Notes</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• You can upload diagnostic reports but <strong>cannot view</strong> patient records</li>
          <li>• Patient must grant permission first (via "Grant Diagnostics Lab Access" in their dashboard)</li>
          <li>• All reports are <strong>encrypted client-side</strong> before upload to IPFS</li>
          <li>• Your wallet address: <code className="bg-yellow-100 px-1 rounded text-xs">{account}</code></li>
          <li>• Patient can see your reports under "Uploaded by:" field in their records</li>
        </ul>
      </div>
    </div>
  );
}
