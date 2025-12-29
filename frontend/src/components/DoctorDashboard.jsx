import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
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

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
    <div className="space-y-8">
      {/* Status Message */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key="message"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`p-4 rounded-xl flex items-start gap-3 ${
              message.includes("❌") || message.includes("Failed") ? "bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]" : 
              message.includes("⚠️") ? "bg-[#FFFBEB] border border-[#FCD34D] text-[#D97706]" : 
              "bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]"
            }`}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            {message.includes("❌") || message.includes("Failed") ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            ) : message.includes("⚠️") ? (
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            )}
          </svg>
          <span className="text-sm font-medium">{message}</span>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Patient Selector Component */}
      <div className="floating-panel p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Select Patient</h2>
            <p className="text-sm text-[#475569]">Enter or search for a patient address</p>
          </div>
        </div>

        {/* Search Input with Manual Paste Support */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-[#0F172A] mb-2">
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
                setShowValidation(false);
              }}
              placeholder="Type to search or paste full address (0x...)"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl 
                focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent
                placeholder-gray-400 text-[#0F172A] transition-all duration-200 pr-10"
            />
            <svg className="absolute right-4 top-3.5 w-5 h-5 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Address Validation Indicator */}
          {selectedPatient && showValidation && !ethers.isAddress(selectedPatient) && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-[#DC2626] bg-[#FEF2F2] px-3 py-1.5 rounded-lg font-medium">
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
          <div className="mb-5">
            <label className="block text-sm font-medium text-[#0F172A] mb-3">
              Recent Patients
            </label>
            <div className="flex flex-wrap gap-2">
              {recentPatients.map((addr, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedPatient(addr);
                    setSearchQuery('');
                    setShowValidation(false);
                  }}
                  className="px-4 py-2 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] rounded-xl text-sm 
                    font-semibold border border-[#BFDBFE] transition-all duration-200 hover:shadow-sm"
                  title={addr}
                >
                  {shortenAddress(addr)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtered Patients Dropdown */}
        {searchQuery && filteredPatients.length > 0 && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-[#0F172A] mb-3">
              Matching Patients
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl bg-[#F8FAFC]">
              {filteredPatients.map((addr, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedPatient(addr);
                    setSearchQuery('');
                    setShowValidation(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white text-sm font-mono 
                    border-b border-gray-100 last:border-b-0 transition-colors duration-200 text-[#475569] hover-glow"
                >
                  {addr}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Patient Display */}
        {selectedPatient && ethers.isAddress(selectedPatient) && (
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 animate-slide-up">
            <p className="text-sm font-semibold text-[#1E40AF] mb-2">Selected Patient:</p>
            <code className="text-xs bg-white px-3 py-1.5 rounded-lg text-[#2563EB] break-all block">
              {selectedPatient}
            </code>
          </div>
        )}
      </div>

      {/* Two Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Panel: Write Record */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#14B8A6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Write Record</h2>
              <p className="text-sm text-[#475569]">Upload prescription or consultation notes</p>
            </div>
          </div>

          <form onSubmit={handleUploadRecord} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Record Type
              </label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl 
                  focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent
                  text-[#0F172A] transition-all duration-300 cursor-pointer"
                style={{background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(20, 184, 166, 0.15)'}}
                disabled={uploading}
              >
                <option value="prescription">💊 Prescription</option>
                <option value="consultation">🩺 Consultation Record</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Select File (PDF or Image, max 10MB)
              </label>
              <input
                id="doctor-file-upload"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/jpg"
                onChange={handleFileSelect}
                className="block w-full text-sm text-[#475569]
                  file:mr-4 file:py-2.5 file:px-5
                  file:rounded-xl file:border-0
                  file:text-sm file:font-semibold
                  file:bg-[#F0FDFA] file:text-[#14B8A6]
                  hover:file:bg-[#CCFBF1]
                  file:transition-colors file:duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={uploading}
              />
              {selectedFile && (
                <div className="mt-3 flex items-center gap-2 text-sm text-[#0D9488] bg-[#F0FDFA] px-3 py-2 rounded-lg animate-slide-up">
                  <svg className="w-4 h-4 icon-bounce" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">{selectedFile.name}</span>
                  <span className="text-[#475569]">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile || !selectedPatient || !ethers.isAddress(selectedPatient)}
              className="w-full bg-[#14B8A6] text-white px-6 py-3 rounded-xl hover:bg-[#0D9488] 
                disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2
                flex items-center justify-center gap-2 hover-glow"
            >
              {uploading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload {recordType === 'prescription' ? 'Prescription' : 'Consultation'}
                </>
              )}
            </button>
          </form>

          <div className="mt-5 bg-[#F0FDFA] border border-[#99F6E4] rounded-xl p-4">
            <p className="text-xs text-[#0D9488] font-medium">
              Patient must grant you access before you can upload records
            </p>
          </div>
        </div>

        {/* Right Panel: View Records */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">View Records</h2>
              <p className="text-sm text-[#475569]">Access patient health records</p>
            </div>
          </div>

          <button
            onClick={handleFetchRecords}
            disabled={loading || !selectedPatient || !ethers.isAddress(selectedPatient)}
            className="w-full bg-[#8B5CF6] text-white px-6 py-3 rounded-xl hover:bg-[#7C3AED] 
              disabled:opacity-50 disabled:cursor-not-allowed font-semibold mb-5 transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:ring-offset-2
              flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Loading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fetch Patient Records
              </>
            )}
          </button>

          {records.length > 0 ? (
            <div className="animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-[#F5F3FF] text-[#8B5CF6] rounded-full text-sm font-bold animate-bounce-in">
                  {records.length} Record{records.length !== 1 ? 's' : ''} Found
                </span>
              </div>
              
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                {records.map((record, index) => {
                  const getDisplayName = () => {
                    const dateStr = new Date(Number(record.timestamp) * 1000).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    });
                    
                    if (record.uploader.toLowerCase() === selectedPatient.toLowerCase()) {
                      return `Medical Record - ${dateStr}`;
                    }
                    return `Medical Note - ${dateStr}`;
                  };
                  
                  const displayName = getDisplayName();
                  
                  return (
                    <div key={index} className="rounded-xl p-4 transition-all duration-200 animate-slide-up hover-glow" style={{background: 'rgba(248, 250, 252, 0.6)', border: '1px solid rgba(255, 255, 255, 0.3)', animationDelay: `${index * 0.1}s`}}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#0F172A] text-sm truncate mb-2" title={displayName}>{displayName}</p>
                          <p className="text-xs text-[#475569] flex items-center gap-1.5 mb-1">
                            <svg className="w-3.5 h-3.5 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(Number(record.timestamp) * 1000).toLocaleDateString()}
                          </p>
                          <code className="text-xs text-[#475569] bg-white px-2 py-1 rounded-lg border border-gray-100 block truncate" title={record.cid}>
                            CID: {record.cid.substring(0, 16)}...
                          </code>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleViewFile(record.cid, index)}
                            disabled={downloadingCID === record.cid}
                            className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold 
                              hover:bg-[#1D4ED8] disabled:opacity-50 whitespace-nowrap transition-all duration-200
                              focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1"
                          >
                            {downloadingCID === record.cid ? "..." : "View"}
                          </button>
                          <button
                            onClick={() => handleDownloadFile(record.cid, index)}
                            disabled={downloadingCID === record.cid}
                            className="px-4 py-2 bg-[#22C55E] text-white rounded-lg text-xs font-semibold 
                              hover:bg-[#16A34A] disabled:opacity-50 whitespace-nowrap transition-all duration-200
                              focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-1"
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
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#F5F3FF] rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-[#C4B5FD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-[#475569] text-sm">Select a patient and click "Fetch Patient Records"</p>
            </div>
          )}

          <div className="mt-5 bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl p-4">
            <p className="text-xs text-[#7C3AED] font-medium">
              You can only access records for patients who granted you permission
            </p>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="floating-panel p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
            <svg className="w-6 h-6 text-[#2563EB]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-[#0F172A] font-bold text-lg mb-2">How to Access Records</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <span>Request the patient to grant you access using your wallet: <code className="bg-white px-2 py-0.5 rounded-md text-[#2563EB] text-xs">{account.substring(0, 10)}...{account.substring(38)}</code></span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <span>Once granted, enter the patient's wallet address above</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <span>You will be able to view, download, and upload records to their vault</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#22C55E] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">✓</span>
                <span>All files are encrypted and will be decrypted automatically when viewing</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
