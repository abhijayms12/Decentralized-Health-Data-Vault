import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { encryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS } from "../utils/ipfs";

export default function DiagnosticsDashboard({ contract, account }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [hasAccess, setHasAccess] = useState(null); // null = not checked, true/false = checked
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [recentUploads, setRecentUploads] = useState([]);

  // Check encryption key on mount
  useEffect(() => {
    checkEncryptionKey();
    loadRecentUploads();
  }, []);

  // Reset access status when patient address changes
  useEffect(() => {
    if (!ethers.isAddress(patientAddress)) {
      setHasAccess(null);
    } else {
      // For diagnostics (write-only role), we can't proactively check access
      // Access will be determined on first upload attempt
      setHasAccess(null);
    }
  }, [patientAddress]);

  // Check if encryption key is configured
  const checkEncryptionKey = () => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      showMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    } else {
      // Clear any existing error messages when key is configured
      setMessage("");
    }
  };

  // Show message helper
  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 5000);
  };

  // Load recent uploads from localStorage
  const loadRecentUploads = () => {
    try {
      const stored = localStorage.getItem(`diagnosticsRecentUploads_${account}`);
      if (stored) {
        setRecentUploads(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load recent uploads:", error);
    }
  };

  // Save upload to recent uploads
  const saveUploadToRecent = (patientAddr, filename, cid) => {
    const upload = {
      patient: patientAddr,
      filename: filename,
      cid: cid,
      timestamp: Date.now(),
    };
    
    const updated = [upload, ...recentUploads].slice(0, 10); // Keep last 10
    setRecentUploads(updated);
    localStorage.setItem(`diagnosticsRecentUploads_${account}`, JSON.stringify(updated));
  };

  // Shorten address helper
  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(38)}`;
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
      
      // Save to recent uploads
      saveUploadToRecent(patientAddress, selectedFile.name, cid);
      
      // Mark access as granted after successful upload
      setHasAccess(true);
      
      setSelectedFile(null);
      document.getElementById("diagnostic-upload").value = "";

    } catch (error) {
      console.error("Error uploading file:", error);
      
      let errorMsg = "❌ Upload failed: ";
      
      if (error.message.includes("No permission") || error.message.includes("has not granted")) {
        errorMsg = "❌ Patient has not granted you permission. Patient must visit their dashboard and grant Diagnostics Lab access first.";
        setHasAccess(false); // Mark access as denied
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg = "❌ Transaction rejected by user";
      } else if (error.message.includes("Not authorized")) {
        errorMsg = "❌ You don't have permission to add records for this patient. Patient must grant access first.";
        setHasAccess(false); // Mark access as denied
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
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Diagnostics Lab Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg font-semibold ${
          message.includes("❌") ? "bg-red-100 text-red-700" :
          message.includes("✅") ? "bg-green-100 text-green-700" :
          message.includes("⚠️") ? "bg-yellow-100 text-yellow-700" :
          "bg-blue-100 text-blue-700"
        }`}>
          {message}
        </div>
      )}

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

      {/* Main Workspace - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* LEFT COLUMN: Patient Selection & Access Status */}
        <div className="bg-white shadow-lg rounded-lg p-6 border-t-4 border-purple-500">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Patient Selection
          </h2>

          <div className="space-y-4">
            {/* Patient Address Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient Wallet Address
              </label>
              <input
                type="text"
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
                placeholder="Enter patient's wallet address (0x...)"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-2 text-xs text-gray-500">
                Patient must grant Diagnostics access before you can upload
              </p>
            </div>

            {/* Access Status Indicator */}
            {ethers.isAddress(patientAddress) && (
              <div className="border-2 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Access Status</p>
                {hasAccess === true ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                    <span className="text-lg">🟢</span>
                    <span className="font-semibold">Access Granted</span>
                  </div>
                ) : hasAccess === false ? (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                    <span className="text-lg">🔴</span>
                    <div>
                      <span className="font-semibold">No Access</span>
                      <p className="text-xs mt-1">Patient must grant permission first</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                    <span className="text-lg">ℹ️</span>
                    <div>
                      <span className="font-semibold">Ready to Upload</span>
                      <p className="text-xs mt-1">Access status will be verified on upload</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selected Patient Display */}
            {ethers.isAddress(patientAddress) && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-900 mb-1">Selected Patient:</p>
                <code className="text-xs bg-white px-2 py-1 rounded text-purple-800 break-all block">
                  {patientAddress}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Upload Diagnostic Report */}
        <div className="bg-white shadow-lg rounded-lg p-6 border-t-4 border-green-500">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Report
          </h2>

          <div className="space-y-4">
            {/* File Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select PDF File (max 10MB)
              </label>
              <input
                id="diagnostic-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                disabled={uploading || !ethers.isAddress(patientAddress)}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-green-50 file:text-green-700
                  hover:file:bg-green-100
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* File Preview Card */}
            {selectedFile && (
              <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-green-900 mb-2">Selected File</p>
                <div className="flex items-start gap-3">
                  <svg className="w-10 h-10 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-green-900 truncate" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Size: {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                    <p className="text-xs text-green-700">
                      Type: PDF Document
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleFileUpload}
              disabled={!selectedFile || uploading || !ethers.isAddress(patientAddress) || encryptionKey === null}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 
                disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Encrypt & Upload Report
                </>
              )}
            </button>

            {/* Inline Help */}
            {hasAccess === false && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-800">
                  <strong>⚠️ Cannot Upload:</strong> Patient has not granted you access. 
                  Patient must visit their dashboard and grant "Diagnostics Lab Access".
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Uploads Section */}
      {recentUploads.length > 0 && (
        <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-blue-500">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Recent Reports Uploaded
          </h2>
          
          <div className="space-y-3">
            {recentUploads.map((upload, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate" title={upload.filename}>
                      {upload.filename}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">Patient:</span> {shortenAddress(upload.patient)}
                    </p>
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Uploaded:</span> {new Date(upload.timestamp).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 truncate" title={upload.cid}>
                      CID: {upload.cid.substring(0, 20)}...
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Uploaded
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-gray-500 mt-4 text-center">
            Showing your last {recentUploads.length} upload{recentUploads.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Bottom Info Bar */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 text-sm text-blue-800">
            <p className="font-semibold mb-1">Diagnostics Role (Write-Only)</p>
            <p className="text-xs">
              You can upload diagnostic reports but cannot view patient records. 
              All files are encrypted before upload. Your wallet: <code className="bg-blue-100 px-1 rounded">{shortenAddress(account)}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
