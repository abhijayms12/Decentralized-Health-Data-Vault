import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { encryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS } from "../utils/ipfs";
import { 
  encodeAddressToId, 
  validatePatientInput,
  parseUserId,
  formatFileSize,
  ROLE_ENUM 
} from "../utils/userId.js";

/**
 * DiagnosticsDashboard Component
 * 
 * Key Features (Phase 4 Feedback Implementation):
 * 1. Uses UserID format (DIA-XXXXXXXX) for display
 * 2. NO recent uploads displayed in UI (still stored for audit)
 * 3. Pre-checks access BEFORE enabling upload button
 * 4. Write-only access - no view/download capability
 */
export default function DiagnosticsDashboard({ contract, account }) {
  // Patient selection state
  const [patientInput, setPatientInput] = useState("");
  const [patientAddress, setPatientAddress] = useState(null);
  const [inputError, setInputError] = useState("");
  
  // Access control state
  const [accessStatus, setAccessStatus] = useState(null); // null | 'checking' | 'granted' | 'denied' | 'error'
  const [canUpload, setCanUpload] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [encryptionKey, setEncryptionKey] = useState(null);
  
  // Diagnostics' own UserID
  const [diagnosticsUserId, setDiagnosticsUserId] = useState("");

  // Generate diagnostics' own UserID on mount
  useEffect(() => {
    if (account) {
      try {
        const userId = encodeAddressToId(account, 'DIA');
        setDiagnosticsUserId(userId);
      } catch (e) {
        console.error('Failed to generate diagnostics UserID:', e);
      }
    }
  }, [account]);

  // Check encryption key on mount
  useEffect(() => {
    checkEncryptionKey();
  }, []);

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Debounced access check when patient input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (patientInput.trim()) {
        handlePatientInputChange(patientInput);
      } else {
        resetPatientState();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [patientInput]);

  // Reset patient-related state
  const resetPatientState = () => {
    setPatientAddress(null);
    setInputError("");
    setAccessStatus(null);
    setCanUpload(false);
  };

  // Handle patient input change with validation and access pre-check
  const handlePatientInputChange = async (input) => {
    if (!input.trim()) {
      resetPatientState();
      return;
    }

    const validation = validatePatientInput(input);
    
    if (validation.type === 'invalid') {
      setInputError(validation.error || 'Invalid input');
      setPatientAddress(null);
      setAccessStatus(null);
      setCanUpload(false);
      return;
    }

    setInputError("");

    let resolvedAddress = null;

    if (validation.type === 'address') {
      resolvedAddress = validation.value;
    } else if (validation.type === 'userId') {
      // Resolve Patient UserID to address
      setAccessStatus('checking');
      
      try {
        const { prefix, hash } = parseUserId(validation.value);
        
        // Verify it's a patient ID
        if (prefix !== 'PAT') {
          setInputError(`Invalid ID type. Expected Patient ID (PAT-XXXXXXXX), got ${prefix}-${hash}`);
          setAccessStatus(null);
          setCanUpload(false);
          return;
        }
        
        const shortHashBytes = '0x' + hash;
        resolvedAddress = await contract.resolveShortUserId(shortHashBytes);
        
        if (!resolvedAddress || resolvedAddress === ethers.ZeroAddress) {
          setInputError("Patient ID not found. The patient must register their UserID first.");
          setAccessStatus(null);
          setCanUpload(false);
          return;
        }
      } catch (err) {
        console.error('UserID resolution failed:', err);
        setInputError("Failed to resolve Patient ID. They may not have registered yet.");
        setAccessStatus(null);
        setCanUpload(false);
        return;
      }
    }

    if (!resolvedAddress || !ethers.isAddress(resolvedAddress)) {
      setInputError("Could not resolve to a valid address");
      setAccessStatus(null);
      setCanUpload(false);
      return;
    }

    // Prevent uploading to self
    if (resolvedAddress.toLowerCase() === account.toLowerCase()) {
      setInputError("Cannot upload to your own address");
      setAccessStatus(null);
      setCanUpload(false);
      return;
    }

    setPatientAddress(resolvedAddress);
    
    // PRE-CHECK access BEFORE enabling upload button
    await checkAccessStatus(resolvedAddress);
  };

  // Pre-check access status for the patient
  const checkAccessStatus = async (patientAddr) => {
    if (!contract || !patientAddr) {
      setAccessStatus('error');
      setCanUpload(false);
      return;
    }

    try {
      setAccessStatus('checking');
      
      // First verify the address is a patient
      const patientRole = await contract.getRole(patientAddr);
      if (Number(patientRole) !== ROLE_ENUM.PATIENT) {
        setAccessStatus('denied');
        setInputError("This address is not registered as a Patient");
        setCanUpload(false);
        return;
      }

      // Check if diagnostics has access
      const hasAccess = await contract.hasDiagnosticsAccess(patientAddr, account);
      
      if (hasAccess) {
        setAccessStatus('granted');
        setCanUpload(true);
        setInputError("");
        
        // Store in localStorage for audit (but don't display in UI)
        addToAuditLog(patientAddr, 'access_verified');
      } else {
        setAccessStatus('denied');
        setCanUpload(false);
      }
      
    } catch (error) {
      console.error("Access check failed:", error);
      setAccessStatus('error');
      setInputError("Unable to verify access. Please try again.");
      setCanUpload(false);
    }
  };

  // Store audit log (NOT displayed in UI)
  const addToAuditLog = (address, action) => {
    if (!ethers.isAddress(address) || !contract) return;
    
    try {
      const contractAddress = contract?.target || contract?.address;
      if (!contractAddress) return;
      
      const storageKey = `diagnosticsAuditLog_${account}_${contractAddress}`;
      const stored = localStorage.getItem(storageKey);
      let auditLog = [];
      
      try {
        auditLog = stored ? JSON.parse(stored) : [];
      } catch (e) {
        auditLog = [];
      }
      
      const auditEntry = {
        address: address,
        timestamp: Date.now(),
        action: action
      };
      
      // Keep last 50 for audit
      const updated = [auditEntry, ...auditLog].slice(0, 50);
      
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save audit log:', e);
    }
  };

  // Check if encryption key is configured
  const checkEncryptionKey = () => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      showMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    } else {
      setMessage("");
    }
  };

  // Show message helper
  const showMessage = (text) => {
    setMessage(text);
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

    if (file.type !== "application/pdf") {
      showMessage("❌ Only PDF files are supported");
      event.target.value = "";
      return;
    }

    const maxSize = 10 * 1024 * 1024;
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
    if (!canUpload) {
      showMessage("❌ Cannot upload - access not granted by patient");
      return;
    }

    if (!encryptionKey) {
      checkEncryptionKey();
      if (!encryptionKey) return;
    }

    if (!selectedFile) {
      showMessage("❌ Please select a file first");
      return;
    }

    if (!patientAddress) {
      showMessage("❌ No patient selected");
      return;
    }

    try {
      setUploading(true);
      showMessage("📋 Reading file...");

      const fileData = await readFileAsArrayBuffer(selectedFile);

      showMessage("🔐 Encrypting diagnostic report...");
      const encryptedData = encryptFileShared(fileData);

      showMessage("📤 Uploading to IPFS...");
      const cid = await uploadToIPFS(encryptedData, selectedFile.name);

      showMessage("⛓️ Recording on blockchain...");
      const tx = await contract.addDiagnosticRecord(patientAddress, cid, selectedFile.name);
      
      showMessage("⏳ Waiting for confirmation...");
      await tx.wait();

      const patientUserId = encodeAddressToId(patientAddress, 'PAT');
      showMessage(`✅ Diagnostic report uploaded successfully for ${patientUserId}!`);
      
      // Save to audit log (not displayed)
      addToAuditLog(patientAddress, 'upload_success');
      
      setSelectedFile(null);
      document.getElementById("diagnostic-upload").value = "";

    } catch (error) {
      console.error("Error uploading file:", error);
      
      if (error.message.includes("No permission") || 
          error.message.includes("has not granted") ||
          error.message.includes("Not authorized") ||
          error.message.includes("missing revert data") ||
          error.code === "CALL_EXCEPTION") {
        showMessage("❌ Access Denied: Patient has not granted you permission.");
        setAccessStatus('denied');
        setCanUpload(false);
      } else if (error.message.includes("ACTION_REJECTED")) {
        showMessage("❌ Transaction rejected by user.");
      } else if (error.message.includes("insufficient funds")) {
        showMessage("❌ Insufficient funds: Please add ETH to your wallet.");
      } else {
        showMessage(`❌ Upload failed: ${error.message}`);
      }
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
      {/* Diagnostics' Own UserID Display */}
      <div className="floating-panel p-4 bg-gradient-to-r from-purple-50 to-violet-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#8B5CF6] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[#475569]">Your Diagnostics ID</p>
              <p className="font-bold text-[#6D28D9] font-mono text-lg">{diagnosticsUserId}</p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(diagnosticsUserId);
              showMessage("✅ Diagnostics ID copied to clipboard!");
            }}
            className="px-4 py-2 bg-white text-[#8B5CF6] rounded-lg text-sm font-semibold 
              hover:bg-[#F5F3FF] transition-colors border border-[#DDD6FE]"
          >
            Copy ID
          </button>
        </div>
        <p className="text-xs text-[#64748B] mt-2">Share this ID with patients so they can grant you access</p>
      </div>

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
                Add <code className="bg-white px-2 py-0.5 rounded text-[#92400E]">VITE_ENCRYPTION_KEY</code> to your .env file
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
            <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Find Patient</h2>
              <p className="text-sm text-[#475569]">Enter Patient ID to upload reports</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Patient Address Input */}
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Patient ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientInput}
                  onChange={(e) => setPatientInput(e.target.value)}
                  placeholder="Enter Patient ID (PAT-XXXXXXXX)"
                  className={`w-full px-4 py-3 bg-white border rounded-xl 
                    focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent
                    placeholder-gray-400 text-[#0F172A] transition-all duration-200 pr-10
                    ${inputError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {accessStatus === 'checking' && (
                  <div className="absolute right-4 top-3.5">
                    <div className="w-5 h-5 border-2 border-[#8B5CF6] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              
              {/* Input Error */}
              {inputError && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {inputError}
                </p>
              )}
            </div>

            {/* Access Status Display */}
            {patientAddress && accessStatus && accessStatus !== 'checking' && (
              <div className={`p-4 rounded-xl border ${
                accessStatus === 'granted' 
                  ? 'bg-[#F0FDF4] border-[#BBF7D0]' 
                  : accessStatus === 'denied'
                  ? 'bg-[#FEF2F2] border-[#FECACA]'
                  : 'bg-[#FFFBEB] border-[#FCD34D]'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    accessStatus === 'granted' ? 'bg-[#22C55E]' : 
                    accessStatus === 'denied' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'
                  }`}>
                    {accessStatus === 'granted' ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : accessStatus === 'denied' ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={`font-semibold ${
                      accessStatus === 'granted' ? 'text-[#16A34A]' : 
                      accessStatus === 'denied' ? 'text-[#DC2626]' : 'text-[#D97706]'
                    }`}>
                      {accessStatus === 'granted' ? 'Access Granted — You may upload reports' : 
                       accessStatus === 'denied' ? 'Access Denied — Patient has not granted you permission' :
                       'Unable to verify access'}
                    </p>
                    <p className="text-sm text-[#475569] mt-1">
                      Patient: <code className="bg-white px-2 py-0.5 rounded">{encodeAddressToId(patientAddress, 'PAT')}</code>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Patient Display */}
            {patientAddress && accessStatus === 'granted' && (
              <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl p-4">
                <p className="text-sm font-semibold text-[#7C3AED] mb-2">Selected Patient:</p>
                <code className="text-xs bg-white px-3 py-1.5 rounded-lg text-[#8B5CF6] break-all block">
                  {encodeAddressToId(patientAddress, 'PAT')}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Upload Diagnostic Report */}
        <div className={`floating-panel p-6 ${!canUpload ? 'opacity-60' : ''}`}>
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
                disabled={!canUpload || uploading}
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
              <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#0D9488] mb-3">Selected File</p>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white border border-gray-100">
                    <svg className="w-6 h-6 text-[#EF4444]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0F172A] truncate" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-[#475569] mt-1">
                      Size: {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleFileUpload}
              disabled={!canUpload || !selectedFile || uploading || encryptionKey === null}
              className="w-full bg-[#14B8A6] text-white py-3 px-4 rounded-xl hover:bg-[#0D9488] 
                disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2
                flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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

            {/* Access Warning */}
            {!canUpload && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
                <p className="text-xs text-[#DC2626] font-medium">
                  ⚠️ Patient must grant you access before you can upload reports
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="floating-panel p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
            <svg className="w-6 h-6 text-[#8B5CF6]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-[#0F172A] font-bold text-lg mb-2">How to Upload Reports</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#8B5CF6] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <span>Share your Diagnostics ID <code className="bg-[#F5F3FF] px-2 py-0.5 rounded text-[#8B5CF6] text-xs">{diagnosticsUserId}</code> with the patient</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#8B5CF6] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <span>Patient grants you Diagnostics access from their dashboard</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#8B5CF6] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <span>Enter patient's ID — access is verified automatically</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#22C55E] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">✓</span>
                <span>Once verified, select a PDF file and click "Encrypt & Upload"</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
