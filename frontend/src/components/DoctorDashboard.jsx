import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { encryptFileShared, decryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS, downloadFromIPFS } from "../utils/ipfs.js";
import { 
  encodeAddressToId, 
  isValidUserId, 
  validatePatientInput,
  parseUserId,
  formatFileSize,
  ROLE_ENUM 
} from "../utils/userId.js";

// TODO: Build a UI that:
// 1. Takes a patient address as input.
// 2. Calls getRecords(patientAddress).
// 3. Fetches files via https://gateway.pinata.cloud/ipfs/<CID>.
// 4. Displays decrypted files if needed.
// - Handle "Not authorized" errors gracefully.

export default function DoctorDashboard({ contract, account }) {
  // Patient selection state
  const [patientInput, setPatientInput] = useState(""); // UserID or address input
  const [patientAddress, setPatientAddress] = useState(null); // Resolved address
  const [inputError, setInputError] = useState("");
  
  // Access control state - PRE-CHECK before enabling buttons
  const [accessStatus, setAccessStatus] = useState(null); // null | 'checking' | 'granted' | 'denied' | 'error'
  const [canView, setCanView] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  
  // Records state
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewingCID, setViewingCID] = useState(null);
  const [message, setMessage] = useState("");
  const [encryptionKey, setEncryptionKey] = useState(null);
  
  // Upload states
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recordType, setRecordType] = useState("prescription");
  
  // Doctor's own UserID for display
  const [doctorUserId, setDoctorUserId] = useState("");

  // Generate doctor's own UserID on mount
  useEffect(() => {
    if (account) {
      try {
        const userId = encodeAddressToId(account, 'DOC');
        setDoctorUserId(userId);
      } catch (e) {
        console.error('Failed to generate doctor UserID:', e);
      }
    }
  }, [account]);

  // Check if shared encryption key is configured
  useEffect(() => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      setMessage("⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    }
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
    setCanView(false);
    setCanUpload(false);
    setRecords([]);
  };

  // Handle patient input change with validation and access pre-check
  const handlePatientInputChange = async (input) => {
    if (!input.trim()) {
      resetPatientState();
      return;
    }

    // Validate input
    const validation = validatePatientInput(input);
    
    if (validation.type === 'invalid') {
      setInputError(validation.error || 'Invalid input');
      setPatientAddress(null);
      setAccessStatus(null);
      setCanView(false);
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
          setCanView(false);
          setCanUpload(false);
          return;
        }
        
        const shortHashBytes = '0x' + hash;
        resolvedAddress = await contract.resolveShortUserId(shortHashBytes);
        
        if (!resolvedAddress || resolvedAddress === ethers.ZeroAddress) {
          setInputError("Patient ID not found. The patient must register their UserID first.");
          setAccessStatus(null);
          setCanView(false);
          setCanUpload(false);
          return;
        }
      } catch (err) {
        console.error('UserID resolution failed:', err);
        setInputError("Failed to resolve Patient ID. They may not have registered yet.");
        setAccessStatus(null);
        setCanView(false);
        setCanUpload(false);
        return;
      }
    }

    if (!resolvedAddress || !ethers.isAddress(resolvedAddress)) {
      setInputError("Could not resolve to a valid address");
      setAccessStatus(null);
      setCanView(false);
      setCanUpload(false);
      return;
    }

    setPatientAddress(resolvedAddress);
    
    // PRE-CHECK access BEFORE enabling any buttons
    await checkAccessStatus(resolvedAddress);
  };

  // Pre-check access status for the patient
  const checkAccessStatus = async (patientAddr) => {
    if (!contract || !patientAddr) {
      setAccessStatus('error');
      setCanView(false);
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
        setCanView(false);
        setCanUpload(false);
        return;
      }

      // Check if doctor has access
      const hasAccess = await contract.hasDoctorAccess(patientAddr, account);
      
      if (hasAccess) {
        setAccessStatus('granted');
        setCanView(true);
        setCanUpload(true);
        setInputError("");
        
        // Store in localStorage for audit (but don't display in UI)
        addToRecentPatientsAudit(patientAddr);
      } else {
        setAccessStatus('denied');
        setCanView(false);
        setCanUpload(false);
      }
      
    } catch (error) {
      console.error("Access check failed:", error);
      setAccessStatus('error');
      setInputError("Unable to verify access. Please try again.");
      setCanView(false);
      setCanUpload(false);
    }
  };

  // Store recent patients for audit purposes (NOT displayed in UI)
  const addToRecentPatientsAudit = (address) => {
    if (!ethers.isAddress(address) || !contract) return;
    
    try {
      const contractAddress = contract?.target || contract?.address;
      if (!contractAddress) return;
      
      const storageKey = `doctorRecentPatients_${account}_${contractAddress}_audit`;
      const stored = localStorage.getItem(storageKey);
      let auditLog = [];
      
      try {
        auditLog = stored ? JSON.parse(stored) : [];
      } catch (e) {
        auditLog = [];
      }
      
      // Add to audit log with timestamp
      const auditEntry = {
        address: address,
        timestamp: Date.now(),
        action: 'accessed'
      };
      
      // Keep last 50 for audit
      const updated = [auditEntry, ...auditLog.filter(
        p => p.address?.toLowerCase() !== address.toLowerCase()
      )].slice(0, 50);
      
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save audit log:', e);
    }
  };

  // Shorten address helper
  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  const handleFetchRecords = async () => {
    if (!canView || !patientAddress) {
      setMessage("❌ Cannot fetch records - access not granted");
      return;
    }

    try {
      setLoading(true);
      setMessage("Fetching patient records...");
      setRecords([]);

      const patientRecords = await contract.getRecords(patientAddress);
      setRecords(patientRecords);
      setMessage(`✅ Found ${patientRecords.length} record(s)`);

    } catch (error) {
      console.error("Error fetching records:", error);
      
      if (error.message.includes("Not authorized") || 
          error.message.includes("missing revert data") ||
          error.code === "CALL_EXCEPTION") {
        setMessage("❌ Access Denied: Patient has not granted you permission.");
        setAccessStatus('denied');
        setCanView(false);
        setCanUpload(false);
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
      setMessage("⚠️ Encryption key not configured");
      return;
    }

    if (!canView) {
      setMessage("❌ Cannot view - access not granted");
      return;
    }

    try {
      setViewingCID(cid);
      
      const encryptedData = await downloadFromIPFS(cid);
      const blob = decryptFileShared(encryptedData);
      
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");
      
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);

      if (newWindow) {
        setMessage("✅ File opened successfully");
      } else {
        setMessage("⚠️ Pop-up blocked. Please allow pop-ups for this site.");
      }

    } catch (error) {
      console.error("Error viewing file:", error);
      if (error.message.includes("Mock file not found")) {
        setMessage("⚠️ File not found - mock IPFS data is lost on browser restart.");
      } else {
        setMessage(`❌ Failed to view file: ${error.message}`);
      }
    } finally {
      setViewingCID(null);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setMessage("❌ Please select a PDF or image file");
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setMessage("❌ File size must be less than 10MB");
      return;
    }
    
    setSelectedFile(file);
    setMessage("");
  };

  const handleUploadRecord = async (e) => {
    e.preventDefault();

    if (!canUpload) {
      setMessage("❌ Cannot upload - access not granted by patient");
      return;
    }

    if (!patientAddress) {
      setMessage("❌ No patient selected");
      return;
    }

    if (!selectedFile) {
      setMessage("❌ Please select a file");
      return;
    }

    if (!encryptionKey) {
      setMessage("⚠️ Encryption key not configured");
      return;
    }

    try {
      setUploading(true);
      setMessage("📁 Reading file...");

      const fileData = await selectedFile.arrayBuffer();
      
      setMessage("🔐 Encrypting file...");
      const encryptedData = encryptFileShared(fileData);
      
      setMessage("📤 Uploading to IPFS...");
      const filename = `${recordType}-${Date.now()}-${selectedFile.name}`;
      const cid = await uploadToIPFS(encryptedData, filename);
      
      setMessage("📝 Saving to blockchain...");
      const tx = await contract.addDoctorRecord(patientAddress, cid, selectedFile.name);
      
      setMessage("⏳ Waiting for confirmation...");
      await tx.wait();
      
      const patientUserId = encodeAddressToId(patientAddress, 'PAT');
      setMessage(`✅ ${recordType === 'prescription' ? 'Prescription' : 'Consultation record'} uploaded successfully for ${patientUserId}!`);
      
      setSelectedFile(null);
      if (document.getElementById("doctor-file-upload")) {
        document.getElementById("doctor-file-upload").value = "";
      }
      
    } catch (error) {
      console.error("Error uploading record:", error);
      
      if (error.message.includes("Not authorized") || error.message.includes("has not granted")) {
        setMessage("❌ Access denied. Patient must grant you access first.");
        setAccessStatus('denied');
        setCanView(false);
        setCanUpload(false);
      } else if (error.message.includes("user rejected")) {
        setMessage("❌ Transaction cancelled");
      } else {
        setMessage(`❌ Failed to upload: ${error.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Doctor's Own UserID Display */}
      <div className="floating-panel p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2563EB] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[#475569]">Your Doctor ID</p>
              <p className="font-bold text-[#1E40AF] font-mono text-lg">{doctorUserId}</p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(doctorUserId);
              setMessage("✅ Doctor ID copied to clipboard!");
            }}
            className="px-4 py-2 bg-white text-[#2563EB] rounded-lg text-sm font-semibold 
              hover:bg-[#EFF6FF] transition-colors border border-[#BFDBFE]"
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

      {/* Patient Selection Panel with Pre-Check */}
      <div className="floating-panel p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Find Patient</h2>
            <p className="text-sm text-[#475569]">Enter Patient ID to access their records</p>
          </div>
        </div>

        {/* Patient Address Input */}
        <div className="mb-5">
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
                focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent
                placeholder-gray-400 text-[#0F172A] transition-all duration-200 pr-10
                ${inputError ? 'border-red-300' : 'border-gray-200'}`}
            />
            {accessStatus === 'checking' && (
              <div className="absolute right-4 top-3.5">
                <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
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
          <div className={`p-4 rounded-xl border mb-5 ${
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
                  {accessStatus === 'granted' ? 'Access Granted — You may view and upload records' : 
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
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#1E40AF] mb-2">Selected Patient:</p>
            <code className="text-xs bg-white px-3 py-1.5 rounded-lg text-[#2563EB] break-all block">
              {encodeAddressToId(patientAddress, 'PAT')}
            </code>
          </div>
        )}
      </div>

      {/* Two Panel Layout - Only enabled when access is granted */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Panel: Write Record */}
        <div className={`floating-panel p-6 ${!canUpload ? 'opacity-60' : ''}`}>
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
                disabled={!canUpload || uploading}
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
                disabled={!canUpload || uploading}
              />
              {selectedFile && (
                <div className="mt-3 flex items-center gap-2 text-sm text-[#0D9488] bg-[#F0FDFA] px-3 py-2 rounded-lg animate-slide-up">
                  <svg className="w-4 h-4 icon-bounce" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">{selectedFile.name}</span>
                  <span className="text-[#475569]">({formatFileSize(selectedFile.size)})</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canUpload || uploading || !selectedFile}
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

          {!canUpload && (
            <div className="mt-5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
              <p className="text-xs text-[#DC2626] font-medium">
                ⚠️ Patient must grant you access before you can upload records
              </p>
            </div>
          )}
        </div>

        {/* Right Panel: View Records (NO DOWNLOAD) */}
        <div className={`floating-panel p-6 ${!canView ? 'opacity-60' : ''}`}>
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
            disabled={!canView || loading}
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
                    // Use actual filename if available, otherwise fallback to generic name
                    if (record.filename) {
                      return record.filename;
                    }
                    
                    const dateStr = new Date(Number(record.timestamp) * 1000).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    });
                    
                    if (record.uploader.toLowerCase() === patientAddress?.toLowerCase()) {
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
                        {/* Only VIEW button - NO DOWNLOAD for doctors */}
                        <button
                          onClick={() => handleViewFile(record.cid, index)}
                          disabled={viewingCID === record.cid}
                          className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold 
                            hover:bg-[#1D4ED8] disabled:opacity-50 whitespace-nowrap transition-all duration-200
                            focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1"
                        >
                          {viewingCID === record.cid ? "Opening..." : "View"}
                        </button>
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
              <p className="text-[#475569] text-sm">
                {canView ? 'Click "Fetch Patient Records" to view' : 'Access required to view records'}
              </p>
            </div>
          )}

          {!canView && (
            <div className="mt-5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
              <p className="text-xs text-[#DC2626] font-medium">
                ⚠️ Patient must grant you access before you can view records
              </p>
            </div>
          )}
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
            <h3 className="text-[#0F172A] font-bold text-lg mb-2">How to Access Patient Records</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <span>Share your Doctor ID <code className="bg-[#EFF6FF] px-2 py-0.5 rounded text-[#2563EB] text-xs">{doctorUserId}</code> with the patient</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <span>Patient grants you access from their dashboard</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <span>Enter patient's ID above — access is verified automatically</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-[#475569]">
                <span className="w-5 h-5 bg-[#22C55E] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">✓</span>
                <span>Once verified, you can view and upload records (view-only, no download)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
