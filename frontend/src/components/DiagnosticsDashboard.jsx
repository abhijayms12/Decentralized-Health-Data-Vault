import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
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
  }, []);
  
  // Load recent uploads when contract is available or changes
  useEffect(() => {
    if (contract) {
      loadRecentUploads();
    }
  }, [contract, account]);

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
  };

  // Load recent uploads from localStorage
  const loadRecentUploads = () => {
    try {
      const contractAddress = contract?.target || contract?.address;
      if (!contractAddress) return;
      
      const storageKey = `diagnosticsRecentUploads_${account}_${contractAddress}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setRecentUploads(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load recent uploads:", error);
    }
  };

  // Save upload to recent uploads
  const saveUploadToRecent = (patientAddr, filename, cid) => {
    const contractAddress = contract?.target || contract?.address;
    if (!contractAddress) return;
    
    const upload = {
      patient: patientAddr,
      filename: filename,
      cid: cid,
      timestamp: Date.now(),
    };
    
    const updated = [upload, ...recentUploads].slice(0, 10); // Keep last 10
    setRecentUploads(updated);
    
    const storageKey = `diagnosticsRecentUploads_${account}_${contractAddress}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));
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
      
      // Parse common error types
      let errorMsg = "";
      
      if (error.message.includes("No permission") || 
          error.message.includes("has not granted") ||
          error.message.includes("Not authorized") ||
          error.message.includes("missing revert data") ||
          error.code === "CALL_EXCEPTION") {
        errorMsg = "❌ Access Denied: This patient has not granted you permission. The patient must visit their dashboard and grant Diagnostics Lab access first.";
        setHasAccess(false);
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg = "❌ Transaction rejected by user.";
      } else if (error.message.includes("network") || error.message.includes("connection")) {
        errorMsg = "❌ Network error: Please check your connection and try again.";
      } else if (error.message.includes("insufficient funds")) {
        errorMsg = "❌ Insufficient funds: Please add ETH to your wallet.";
      } else {
        errorMsg = `❌ Upload failed. Please ensure the patient has granted you access.`;
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
              message.includes("❌") ? "bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]" :
              message.includes("✅") ? "bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]" :
              message.includes("⚠️") ? "bg-[#FFFBEB] border border-[#FCD34D] text-[#D97706]" :
              "bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]"
            }`}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              {message.includes("❌") ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              ) : message.includes("✅") ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : message.includes("⚠️") ? (
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              )}
            </svg>
            <span className="text-sm font-medium">{message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encryption Key Warning */}
      {encryptionKey === null && (
        <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#FEF3C7] rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#D97706]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-[#92400E] font-semibold mb-1">Encryption Key Not Configured</p>
              <p className="text-[#A16207] text-sm">
                Add <code className="bg-white px-2 py-0.5 rounded text-[#92400E]">VITE_ENCRYPTION_KEY</code> to your .env file for encrypted uploads
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Patient Selection & Access Status */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Patient Selection</h2>
              <p className="text-sm text-[#475569]">Enter the patient's wallet address</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Patient Address Input */}
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Patient Wallet Address
              </label>
              <input
                type="text"
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
                placeholder="Enter patient's wallet address (0x...)"
                className="w-full px-4 py-3 rounded-xl 
                  focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent
                  placeholder-gray-400 text-[#0F172A] transition-all duration-200"
                style={{background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(139, 92, 246, 0.15)'}}
              />
              <p className="mt-2 text-xs text-[#475569]">
                Patient must grant Diagnostics access before you can upload
              </p>
            </div>

            {/* Access Status Indicator */}
            {ethers.isAddress(patientAddress) && (
              <div className="bg-[#F8FAFC] border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-[#0F172A] mb-3">Access Status</p>
                {hasAccess === true ? (
                  <div className="flex items-center gap-3 text-sm text-[#16A34A] bg-[#F0FDF4] px-4 py-3 rounded-xl border border-[#BBF7D0]">
                    <div className="w-8 h-8 bg-[#22C55E] rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="font-semibold">Access Granted</span>
                  </div>
                ) : hasAccess === false ? (
                  <div className="flex items-center gap-3 text-sm text-[#DC2626] bg-[#FEF2F2] px-4 py-3 rounded-xl border border-[#FECACA]">
                    <div className="w-8 h-8 bg-[#EF4444] rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-semibold">No Access</span>
                      <p className="text-xs mt-0.5 text-[#B91C1C]">Patient must grant permission first</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm text-[#2563EB] bg-[#EFF6FF] px-4 py-3 rounded-xl border border-[#BFDBFE]">
                    <div className="w-8 h-8 bg-[#2563EB] rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-semibold">Ready to Upload</span>
                      <p className="text-xs mt-0.5 text-[#1D4ED8]">Access status will be verified on upload</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selected Patient Display */}
            {ethers.isAddress(patientAddress) && (
              <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl p-4 animate-slide-up">
                <p className="text-sm font-semibold text-[#7C3AED] mb-2">Selected Patient:</p>
                <code className="text-xs bg-white px-3 py-1.5 rounded-lg text-[#8B5CF6] break-all block">
                  {patientAddress}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Upload Diagnostic Report */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#14B8A6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Upload Report</h2>
              <p className="text-sm text-[#475569]">Upload diagnostic test results</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* File Input */}
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Select PDF File (max 10MB)
              </label>
              <input
                id="diagnostic-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                disabled={uploading || !ethers.isAddress(patientAddress)}
                className="block w-full text-sm text-[#475569]
                  file:mr-4 file:py-2.5 file:px-5
                  file:rounded-xl file:border-0
                  file:text-sm file:font-semibold
                  file:bg-[#F0FDFA] file:text-[#14B8A6]
                  hover:file:bg-[#CCFBF1]
                  file:transition-colors file:duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* File Preview Card */}
            {selectedFile && (
              <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl p-4 animate-slide-up">
                <p className="text-xs font-semibold text-[#0D9488] mb-3">Selected File</p>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 icon-bounce" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
                    <svg className="w-6 h-6 text-[#EF4444]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0F172A] truncate" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-[#475569] mt-1">
                      Size: {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                    <p className="text-xs text-[#475569]">
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
              className="w-full bg-[#14B8A6] text-white py-3 px-4 rounded-xl hover:bg-[#0D9488] 
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
                  <svg className="w-5 h-5 icon-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Encrypt & Upload Report
                </>
              )}
            </button>

            {/* Inline Help */}
            {hasAccess === false && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
                <p className="text-xs text-[#B91C1C] font-medium">
                  Cannot Upload: Patient has not granted you access. 
                  Patient must visit their dashboard and grant "Diagnostics Lab Access".
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Uploads Section */}
      {recentUploads.length > 0 && (
        <div className="lightweight-section p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1.5 h-8 bg-[#2563EB] rounded-full"></div>
            <h2 className="text-lg font-bold text-[#0F172A]">Recent Reports Uploaded</h2>
            <span className="px-3 py-1 bg-[#EFF6FF] text-[#2563EB] rounded-full text-xs font-bold">
              {recentUploads.length}
            </span>
          </div>
          
          <div className="overflow-x-auto pb-4 scrollbar-thin">
            <div className="flex gap-4 min-w-max">
              {recentUploads.map((upload, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 w-72 rounded-2xl p-5 transition-all duration-200 animate-slide-up"
                  style={{background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)', animationDelay: `${index * 0.1}s`}}
                  onMouseEnter={(e) => {e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 184, 166, 0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'}}
                  onMouseLeave={(e) => {e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02)'; e.currentTarget.style.transform = 'translateY(0)'}}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[#0F172A] text-sm truncate mb-2" title={upload.filename}>
                        {upload.filename}
                      </h4>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F0FDF4] text-[#16A34A] rounded-full text-xs font-semibold border border-[#BBF7D0]">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Uploaded
                      </span>
                    </div>
                    <div className="w-10 h-10 bg-[#FEF2F2] rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
                      <svg className="w-5 h-5 text-[#EF4444]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                    </div>
                  </div>

                  {/* Patient */}
                  <div className="flex items-center gap-2 text-sm text-[#475569] mb-3">
                    <svg className="w-4 h-4 text-[#94A3B8]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    {shortenAddress(upload.patient)}
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-2 text-sm text-[#475569] mb-3">
                    <svg className="w-4 h-4 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(upload.timestamp).toLocaleDateString()}
                  </div>

                  {/* CID */}
                  <div className="mb-4">
                    <code className="text-xs bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg text-[#475569] border border-gray-100 block truncate" title={upload.cid}>
                      {upload.cid.substring(0, 8)}...{upload.cid.substring(upload.cid.length - 6)}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Info Bar */}
      <div className="floating-panel p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
            <svg className="w-6 h-6 text-[#8B5CF6]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-[#0F172A] font-bold text-lg mb-2">Diagnostics Role (Write-Only)</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                You can upload diagnostic reports to patient vaults
              </li>
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                All files are encrypted before upload for security
              </li>
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Your wallet: <code className="bg-white px-2 py-0.5 rounded-lg text-[#8B5CF6] text-xs">{shortenAddress(account)}</code></span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
