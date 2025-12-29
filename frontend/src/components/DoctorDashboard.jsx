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
  const [selectedPatient, setSelectedPatient] = useState(""); // Unified patient selection
  const [searchQuery, setSearchQuery] = useState("");
  const [showValidation, setShowValidation] = useState(false); // Control validation display
  const [authorizedPatients, setAuthorizedPatients] = useState([]); // List of authorized patients
  const [recentPatients, setRecentPatients] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingCID, setDownloadingCID] = useState(null);
  const [message, setMessage] = useState("");
  const [encryptionKey, setEncryptionKey] = useState(null);
  
  // Upload states
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recordType, setRecordType] = useState("prescription");

  // Load recent patients from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('doctorRecentPatients');
    if (stored) {
      try {
        setRecentPatients(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent patients:', e);
      }
    }
  }, []);

  // Check if shared encryption key is configured
  useEffect(() => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    }
  }, []);

  // Add patient to recent list
  const addToRecentPatients = (address) => {
    if (!ethers.isAddress(address)) return;
    
    setRecentPatients(prev => {
      // Remove if exists, add to front, keep only 5
      const filtered = prev.filter(addr => addr.toLowerCase() !== address.toLowerCase());
      const updated = [address, ...filtered].slice(0, 5);
      localStorage.setItem('doctorRecentPatients', JSON.stringify(updated));
      return updated;
    });
  };

  // Shorten address helper
  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  // Filter authorized patients based on search query
  const filteredPatients = authorizedPatients.filter(addr => 
    addr.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFetchRecords = async () => {
    // Trigger validation display
    setShowValidation(true);
    
    if (!ethers.isAddress(selectedPatient)) {
      setMessage("❌ Invalid patient address");
      return;
    }

    try {
      setLoading(true);
      setMessage("Fetching patient records...");
      setRecords([]);

      // Call smart contract to get records
      const patientRecords = await contract.getRecords(selectedPatient);
      
      setRecords(patientRecords);
      setMessage(`✅ Found ${patientRecords.length} record(s)`);
      
      // Add to recent patients
      addToRecentPatients(selectedPatient);

    } catch (error) {
      console.error("Error fetching records:", error);
      
      if (error.message.includes("Not authorized")) {
        setMessage("❌ You are not authorized to view this patient's records. The patient must grant you access first.");
      } else {
        setMessage(`❌ Failed to fetch records: ${error.message}`);
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

    // Trigger validation display
    setShowValidation(true);
    
    if (!ethers.isAddress(selectedPatient)) {
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
      const tx = await contract.addDoctorRecord(selectedPatient, cid);
      
      setMessage("⏳ Waiting for confirmation...");
      await tx.wait();
      
      setMessage(`✅ ${recordType === 'prescription' ? 'Prescription' : 'Consultation record'} uploaded successfully!`);
      
      // Add to recent patients
      addToRecentPatients(selectedPatient);
      
      // Clear form
      setSelectedFile(null);
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
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Doctor Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.includes("❌") || message.includes("Failed") ? "bg-red-100 text-red-700" : 
          message.includes("⚠️") ? "bg-yellow-100 text-yellow-700" : 
          "bg-green-100 text-green-700"
        }`}>
          {message}
        </div>
      )}

      {/* Patient Selector Component - Shared */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-6 border-t-4 border-blue-500">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Select Patient
        </h2>

        {/* Search Input with Manual Paste Support */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search or Enter Patient Address
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery || selectedPatient}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                setSelectedPatient(value);
                // Reset validation on typing
                setShowValidation(false);
              }}
              placeholder="Type to search or paste full address (0x...)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg className="absolute right-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Address Validation Indicator - Only show after button click with invalid address */}
          {selectedPatient && showValidation && !ethers.isAddress(selectedPatient) && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 text-sm text-red-700 bg-red-100 px-3 py-1 rounded-full">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Invalid Ethereum Address
              </span>
            </div>
          )}
        </div>

        {/* Recent Patients */}
        {recentPatients.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recent Patients
            </label>
            <div className="flex flex-wrap gap-2">
              {recentPatients.map((addr, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedPatient(addr);
                    setSearchQuery('');
                    setShowValidation(false); // No need to show validation for known-valid address
                  }}
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium border border-blue-200 transition"
                  title={addr}
                >
                  {shortenAddress(addr)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtered Patients Dropdown (if searching) */}
        {searchQuery && filteredPatients.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Matching Patients
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg">
              {filteredPatients.map((addr, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedPatient(addr);
                    setSearchQuery('');
                    setShowValidation(false); // No need to show validation for known-valid address
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm font-mono border-b last:border-b-0"
                >
                  {addr}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Patient Display */}
        {selectedPatient && ethers.isAddress(selectedPatient) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-900 mb-1">Selected Patient:</p>
            <code className="text-xs bg-white px-2 py-1 rounded text-blue-800 break-all">
              {selectedPatient}
            </code>
          </div>
        )}
      </div>

      {/* Two Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Write Record */}
        <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-green-500">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Write Record
          </h2>

          <form onSubmit={handleUploadRecord} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Record Type
              </label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                disabled={uploading}
              />
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-600 flex items-center gap-1">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile || !selectedPatient || !ethers.isAddress(selectedPatient)}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
            >
              {uploading ? "Uploading..." : `Upload ${recordType === 'prescription' ? 'Prescription' : 'Consultation'}`}
            </button>
          </form>

          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800">
              <strong>Note:</strong> Patient must grant you access before you can upload records.
            </p>
          </div>
        </div>

        {/* Right Panel: View Records */}
        <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-purple-500">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Records
          </h2>

          <button
            onClick={handleFetchRecords}
            disabled={loading || !selectedPatient || !ethers.isAddress(selectedPatient)}
            className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium mb-4 transition"
          >
            {loading ? "Loading..." : "Fetch Patient Records"}
          </button>

          {records.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">
                  {records.length} Record{records.length !== 1 ? 's' : ''} Found
                </p>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {records.map((record, index) => {
                  // Generate filename based on uploader role and timestamp
                  const getDisplayName = () => {
                    const dateStr = new Date(Number(record.timestamp) * 1000).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    });
                    
                    // Determine source based on uploader address
                    // Patient records: uploaded by the patient themselves
                    // Doctor records: uploaded by a doctor
                    // Diagnostics records: uploaded by diagnostics
                    if (record.uploader.toLowerCase() === selectedPatient.toLowerCase()) {
                      return `Medical Record - ${dateStr}`;
                    }
                    // If we had role info, we could distinguish doctor vs diagnostics
                    // For now, assume other uploaders are medical professionals
                    return `Medical Note - ${dateStr}`;
                  };
                  
                  const displayName = getDisplayName();
                  
                  return (
                  <div key={index} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate" title={displayName}>{displayName}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          <span className="font-semibold">Date:</span>{" "}
                          {new Date(Number(record.timestamp) * 1000).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-600 truncate" title={record.cid}>
                          <span className="font-semibold">CID:</span> {record.cid.substring(0, 20)}...
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleViewFile(record.cid, index)}
                          disabled={downloadingCID === record.cid}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {downloadingCID === record.cid ? "..." : "View"}
                        </button>
                        <button
                          onClick={() => handleDownloadFile(record.cid, index)}
                          disabled={downloadingCID === record.cid}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {downloadingCID === record.cid ? "..." : "Download"}
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Select a patient and click "Fetch Patient Records"</p>
            </div>
          )}

          <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-purple-800">
              <strong>Note:</strong> You can only access records for patients who granted you permission.
            </p>
          </div>
        </div>
      </div>

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
