import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { encryptFileShared, decryptFileShared, isEncryptionConfigured } from "../utils/sharedEncryption";
import { uploadToIPFS, downloadFromIPFS, getIPFSGatewayURL } from "../utils/ipfs";

export default function PatientDashboard({ contract, account }) {
  const [records, setRecords] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doctorAddress, setDoctorAddress] = useState("");
  const [diagnosticsAddress, setDiagnosticsAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploaderRoles, setUploaderRoles] = useState({}); // Store roles of uploaders

  // Load patient records on mount
  useEffect(() => {
    if (contract && account) {
      loadRecords();
      checkEncryptionKey();
    }
  }, [contract, account]);

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: "", text: "" });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message.text]);

  // Check if shared encryption key is configured
  const checkEncryptionKey = () => {
    const isConfigured = isEncryptionConfigured();
    setEncryptionKey(isConfigured ? true : null);
    
    if (!isConfigured) {
      showMessage("error", "⚠️ Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
    }
  };

  // Load patient records from contract
  const loadRecords = async () => {
    try {
      setLoading(true);
      console.log("Loading records for:", account);
      
      const patientRecords = await contract.getRecords(account);
      console.log("Records loaded:", patientRecords.length);
      
      // Convert to plain objects
      const recordsArray = patientRecords.map((record, index) => ({
        id: index,
        cid: record.cid,
        timestamp: Number(record.timestamp),
        uploader: record.uploader
      }));
      
      setRecords(recordsArray);

      // Fetch roles for all uploaders
      const roles = {};
      for (const record of recordsArray) {
        if (!roles[record.uploader]) {
          try {
            const role = await contract.getRole(record.uploader);
            roles[record.uploader] = Number(role);
          } catch (err) {
            console.error(`Failed to fetch role for ${record.uploader}:`, err);
            roles[record.uploader] = 0; // Default to NONE
          }
        }
      }
      setUploaderRoles(roles);

    } catch (error) {
      console.error("Error loading records:", error);
      showMessage("error", "Failed to load records: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type (PDF only for now)
    if (file.type !== "application/pdf") {
      showMessage("error", "Only PDF files are supported");
      event.target.value = "";
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showMessage("error", "File size must be less than 10MB");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    showMessage("info", `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
  };

  // Handle file upload - complete workflow
  const handleFileUpload = async () => {
    if (!selectedFile) {
      showMessage("error", "Please select a file first");
      return;
    }

    if (!encryptionKey) {
      showMessage("error", "Encryption key not initialized");
      await initializeEncryptionKey();
      return;
    }

    if (!contract) {
      showMessage("error", "Contract not initialized");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress("Reading file...");

      // 1. Read file as ArrayBuffer
      const fileData = await readFileAsArrayBuffer(selectedFile);
      console.log("✓ File read:", fileData.byteLength, "bytes");

      // 2. Encrypt the file using shared key
      setUploadProgress("Encrypting file...");
      const encryptedData = encryptFileShared(fileData);
      console.log("✓ File encrypted");

      // 3. Upload to IPFS via Lighthouse
      setUploadProgress("Uploading to Lighthouse IPFS...");
      const cid = await uploadToIPFS(encryptedData, selectedFile.name);
      console.log("✓ Uploaded to IPFS, CID:", cid);

      // 4. Store CID on blockchain
      setUploadProgress("Storing record on blockchain...");
      const tx = await contract.addPatientRecord(cid);
      console.log("✓ Transaction sent:", tx.hash);
      
      setUploadProgress("Waiting for confirmation...");
      await tx.wait();
      console.log("✓ Transaction confirmed");

      // 5. Success!
      showMessage("success", `✓ Record uploaded to IPFS and stored on blockchain! CID: ${cid.substring(0, 25)}...`);
      setSelectedFile(null);
      setUploadProgress("");
      
      // Reset file input
      document.getElementById("file-input").value = "";
      
      // Reload records
      await loadRecords();

    } catch (error) {
      console.error("❌ Upload failed:", error);
      showMessage("error", "Upload failed: " + error.message);
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  // Download and decrypt a record
  const handleDownloadRecord = async (record) => {
    if (!encryptionKey) {
      showMessage("error", "Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
      return;
    }

    try {
      showMessage("info", "Downloading from IPFS...");

      // 1. Download from IPFS (may take 10-30 seconds for first download)
      const encryptedData = await downloadFromIPFS(record.cid);
      console.log("✓ Downloaded from IPFS");

      showMessage("info", "Decrypting file...");

      // 2. Decrypt the file using shared key
      const blob = decryptFileShared(encryptedData);
      console.log("✓ File decrypted");

      // 3. Create download link
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-record-${record.id}-${new Date(record.timestamp * 1000).toLocaleDateString()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage("success", "✓ File downloaded and decrypted successfully");

    } catch (error) {
      console.error("Download failed:", error);
      showMessage("error", "Download failed: " + error.message);
    }
  };

  // View record (open in new tab)
  const handleViewRecord = async (record) => {
    if (!encryptionKey) {
      showMessage("error", "Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file");
      return;
    }

    try {
      showMessage("info", "Loading file...");

      // 1. Download from IPFS
      const encryptedData = await downloadFromIPFS(record.cid);
      console.log("✓ Downloaded from IPFS");

      showMessage("info", "Decrypting file...");

      // 2. Decrypt the file using shared key
      const blob = decryptFileShared(encryptedData);
      console.log("✓ File decrypted");

      // 3. Open in new tab
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      
      // Clean up after 60 seconds
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      showMessage("success", "✓ File opened successfully");

    } catch (error) {
      console.error("View failed:", error);
      showMessage("error", "View failed: " + error.message);
    }
  };

  // Grant doctor access
  const handleGrantAccess = async () => {
    if (!doctorAddress) {
      showMessage("error", "Please enter doctor's address");
      return;
    }

    // Validate Ethereum address
    if (!ethers.isAddress(doctorAddress)) {
      showMessage("error", "Invalid Ethereum address");
      return;
    }

    // Prevent granting access to self
    if (doctorAddress.toLowerCase() === account.toLowerCase()) {
      showMessage("error", "Cannot grant access to your own address. Enter a different doctor's wallet address.");
      return;
    }

    try {
      setLoading(true);
      showMessage("info", "Checking doctor's role...");

      // Check if address is registered as a doctor
      const doctorRole = await contract.getRole(doctorAddress);
      if (Number(doctorRole) !== 2) { // 2 = DOCTOR role
        showMessage("error", `This address is not registered as a Doctor. They need to connect their wallet and select the Doctor role first.`);
        setLoading(false);
        return;
      }

      showMessage("info", "Granting access...");

      const tx = await contract.grantDoctorAccess(doctorAddress);
      console.log("Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("Access granted");

      showMessage("success", `✓ Access granted to ${doctorAddress.substring(0, 10)}...`);
      setDoctorAddress("");

    } catch (error) {
      console.error("Grant access failed:", error);
      
      let errorMsg = "Failed to grant access: ";
      if (error.message.includes("Address is not a doctor")) {
        errorMsg += "This address is not registered as a doctor. They must select the Doctor role first.";
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg += "Transaction rejected";
      } else if (error.code === "CALL_EXCEPTION") {
        errorMsg += "Transaction would fail. Make sure the address is registered as a Doctor.";
      } else {
        errorMsg += error.message;
      }
      
      showMessage("error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Grant diagnostics access
  const handleGrantDiagnosticsAccess = async () => {
    if (!diagnosticsAddress) {
      showMessage("error", "Please enter diagnostics lab address");
      return;
    }

    // Validate Ethereum address
    if (!ethers.isAddress(diagnosticsAddress)) {
      showMessage("error", "Invalid Ethereum address");
      return;
    }

    // Prevent granting access to self
    if (diagnosticsAddress.toLowerCase() === account.toLowerCase()) {
      showMessage("error", "Cannot grant access to your own address. Enter a different diagnostics lab's wallet address.");
      return;
    }

    try {
      setLoading(true);
      showMessage("info", "Checking diagnostics lab role...");

      // Check if address is registered as diagnostics
      const diagnosticsRole = await contract.getRole(diagnosticsAddress);
      if (Number(diagnosticsRole) !== 3) { // 3 = DIAGNOSTICS role
        showMessage("error", `This address is not registered as a Diagnostics lab. They need to connect their wallet and select the Diagnostics role first.`);
        setLoading(false);
        return;
      }

      showMessage("info", "Granting diagnostics access...");

      const tx = await contract.grantDiagnosticsAccess(diagnosticsAddress);
      console.log("Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("Diagnostics access granted");

      showMessage("success", `✓ Diagnostics access granted to ${diagnosticsAddress.substring(0, 10)}...`);
      setDiagnosticsAddress("");

    } catch (error) {
      console.error("Grant diagnostics access failed:", error);
      
      let errorMsg = "Failed to grant diagnostics access: ";
      if (error.message.includes("Address is not a diagnostics")) {
        errorMsg += "This address is not registered as a Diagnostics lab. They must select the Diagnostics role first.";
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg += "Transaction rejected";
      } else if (error.code === "CALL_EXCEPTION") {
        errorMsg += "Transaction would fail. Make sure the address is registered as a Diagnostics lab.";
      } else {
        errorMsg += error.message;
      }
      
      showMessage("error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Revoke doctor access
  const handleRevokeAccess = async () => {
    if (!doctorAddress) {
      showMessage("error", "Please enter doctor's address to revoke");
      return;
    }

    // Validate Ethereum address
    if (!ethers.isAddress(doctorAddress)) {
      showMessage("error", "Invalid Ethereum address");
      return;
    }

    try {
      setLoading(true);
      showMessage("info", "Revoking doctor access...");

      const tx = await contract.revokeDoctorAccess(doctorAddress);
      console.log("Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("Access revoked");

      showMessage("success", `✓ Access revoked from ${doctorAddress.substring(0, 10)}...`);
      setDoctorAddress("");

    } catch (error) {
      console.error("Revoke access failed:", error);
      
      let errorMsg = "Failed to revoke access: ";
      if (error.message.includes("ACTION_REJECTED")) {
        errorMsg += "Transaction rejected";
      } else if (error.code === "CALL_EXCEPTION") {
        errorMsg += "Transaction failed. Please check the address.";
      } else {
        errorMsg += error.message;
      }
      
      showMessage("error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Revoke diagnostics access
  const handleRevokeDiagnosticsAccess = async () => {
    if (!diagnosticsAddress) {
      showMessage("error", "Please enter diagnostics lab address to revoke");
      return;
    }

    // Validate Ethereum address
    if (!ethers.isAddress(diagnosticsAddress)) {
      showMessage("error", "Invalid Ethereum address");
      return;
    }

    try {
      setLoading(true);
      showMessage("info", "Revoking diagnostics access...");

      const tx = await contract.revokeDiagnosticsAccess(diagnosticsAddress);
      console.log("Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("Diagnostics access revoked");

      showMessage("success", `✓ Diagnostics access revoked from ${diagnosticsAddress.substring(0, 10)}...`);
      setDiagnosticsAddress("");

    } catch (error) {
      console.error("Revoke diagnostics access failed:", error);
      
      let errorMsg = "Failed to revoke diagnostics access: ";
      if (error.message.includes("ACTION_REJECTED")) {
        errorMsg += "Transaction rejected";
      } else if (error.code === "CALL_EXCEPTION") {
        errorMsg += "Transaction failed. Please check the address.";
      } else {
        errorMsg += error.message;
      }
      
      showMessage("error", errorMsg);
    } finally {
      setLoading(false);
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

  // Helper: Show message
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  };

  // Format timestamp
  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };


  // Shorten address
  const shortenAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  // Helper: Get record source type
  const getRecordSource = (uploader) => {
    if (uploader.toLowerCase() === account.toLowerCase()) {
      return 'patient';
    }
    const role = uploaderRoles[uploader];
    if (role === 2) return 'doctor';     // DOCTOR = 2
    if (role === 3) return 'diagnostics'; // DIAGNOSTICS = 3
    return 'other';
  };

  // Helper: Get badge info for record source
  const getSourceBadge = (uploader) => {
    const source = getRecordSource(uploader);
    switch (source) {
      case 'patient':
        return { label: 'Patient', color: 'bg-[#EFF6FF] text-[#2563EB]' };
      case 'doctor':
        return { label: 'Doctor', color: 'bg-[#F0FDFA] text-[#0D9488]' };
      case 'diagnostics':
        return { label: 'Diagnostics', color: 'bg-[#F5F3FF] text-[#8B5CF6]' };
      default:
        return { label: 'Other', color: 'bg-gray-100 text-gray-700' };
    }
  };

  // Group records by source
  const groupRecordsBySource = () => {
    const patientRecords = [];
    const doctorRecords = [];
    const diagnosticsRecords = [];

    records.forEach(record => {
      const source = getRecordSource(record.uploader);
      if (source === 'patient') {
        patientRecords.push(record);
      } else if (source === 'doctor') {
        doctorRecords.push(record);
      } else if (source === 'diagnostics') {
        diagnosticsRecords.push(record);
      }
    });

    // Sort by timestamp descending (newest first) within each group
    patientRecords.sort((a, b) => b.timestamp - a.timestamp);
    doctorRecords.sort((a, b) => b.timestamp - a.timestamp);
    diagnosticsRecords.sort((a, b) => b.timestamp - a.timestamp);

    return { patientRecords, doctorRecords, diagnosticsRecords };
  };

  const { patientRecords, doctorRecords, diagnosticsRecords } = groupRecordsBySource();

  // Helper: Get filename from CID or use fallback
  const getRecordFilename = (record) => {
    // If CID contains filename info, extract it
    // Otherwise use generic name based on source
    const source = getRecordSource(record.uploader);
    const dateStr = new Date(record.timestamp * 1000).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    if (source === 'patient') {
      return `Medical Record - ${dateStr}`;
    } else if (source === 'doctor') {
      return `Doctor Note - ${dateStr}`;
    } else if (source === 'diagnostics') {
      return `Lab Report - ${dateStr}`;
    }
    return 'Unnamed Document';
  };

  // Helper: Render compact record card
  const renderRecordCard = (record) => {
    const badge = getSourceBadge(record.uploader);
    const filename = getRecordFilename(record);
    const shortCID = `${record.cid.substring(0, 8)}...${record.cid.substring(record.cid.length - 6)}`;
    
    return (
      <div
        key={record.id}
        className="flex-shrink-0 w-72 rounded-2xl p-5 transition-all duration-200"
        style={{background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'}}
        onMouseEnter={(e) => {e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 184, 166, 0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'}}
        onMouseLeave={(e) => {e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02)'; e.currentTarget.style.transform = 'translateY(0)'}}
      >
        {/* Header with badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[#0F172A] text-sm truncate mb-2" title={filename}>
              {filename}
            </h4>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          <div className="w-10 h-10 bg-[#FEF2F2] rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
            <svg className="w-5 h-5 text-[#EF4444]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-center gap-2 text-sm text-[#475569] mb-3">
          <svg className="w-4 h-4 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formatDate(record.timestamp)}
        </div>

        {/* CID */}
        <div className="mb-4">
          <code className="text-xs bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg text-[#475569] border border-gray-100 block truncate">
            {shortCID}
          </code>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => handleViewRecord(record)}
            className="flex-1 bg-[#2563EB] text-white px-3 py-2.5 rounded-xl hover:bg-[#1D4ED8] 
              font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-1.5
              focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2"
            title="Open file in new tab"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View
          </button>
          <button
            onClick={() => handleDownloadRecord(record)}
            className="flex-1 bg-[#22C55E] text-white px-3 py-2.5 rounded-xl hover:bg-[#16A34A] 
              font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-1.5
              focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:ring-offset-2"
            title="Download file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Status Message */}
      <AnimatePresence mode="wait">
        {message.text && (
          <motion.div
            key="message"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`p-4 rounded-xl flex items-start gap-3 ${
              message.type === "success" ? "bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]" :
              message.type === "error" ? "bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]" :
              "bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]"
            }`}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            {message.type === "success" ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            ) : message.type === "error" ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            )}
          </svg>
          <span className="text-sm font-medium">{message.text}</span>
        </motion.div>
        )}
      </AnimatePresence>

      {/* ⚠️ MOCK IPFS WARNING */}
      {import.meta.env.VITE_PINATA_JWT === undefined || 
       import.meta.env.VITE_PINATA_JWT === "" || 
       import.meta.env.VITE_PINATA_JWT === "your_pinata_jwt_token_here" ? (
        <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#FEF3C7] rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#D97706]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-[#92400E] font-semibold mb-1">Development Mode: Files NOT Persistent</h3>
              <p className="text-[#A16207] text-sm">
                Pinata JWT not configured. Files are stored in browser memory and will be lost when you close the browser.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* File Upload Section */}
      <div className="lightweight-section p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Upload Health Record</h2>
            <p className="text-sm text-[#475569]">PDF files are encrypted before storage</p>
          </div>
        </div>

        {!encryptionKey && (
          <div className="mb-5 p-4 bg-[#FFFBEB] border border-[#FCD34D] rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#D97706] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm">
                <p className="text-[#92400E] font-medium mb-1">Encryption key not configured</p>
                <p className="text-[#A16207]">Add VITE_ENCRYPTION_KEY to your .env file</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-2">
              Select PDF File
            </label>
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={uploading || !encryptionKey}
              className="block w-full text-sm text-[#475569]
                file:mr-4 file:py-2.5 file:px-5
                file:rounded-xl file:border-0
                file:text-sm file:font-semibold
                file:bg-[#EFF6FF] file:text-[#2563EB]
                hover:file:bg-[#DBEAFE]
                file:transition-colors file:duration-200
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {selectedFile && (
            <div className="flex items-center gap-3 p-4 bg-[#F8FAFC] rounded-xl border border-gray-100 animate-slide-up">
              <div className="w-10 h-10 bg-[#FEF2F2] rounded-xl flex items-center justify-center icon-bounce">
                <svg className="w-5 h-5 text-[#EF4444]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">{selectedFile.name}</p>
                <p className="text-xs text-[#475569]">{(selectedFile.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>
          )}

          {uploadProgress && (
            <div className="flex items-center gap-3 text-sm text-[#2563EB] font-medium bg-[#EFF6FF] px-4 py-3 rounded-xl animate-slide-up">
              <div className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
              {uploadProgress}
            </div>
          )}

          <button
            onClick={handleFileUpload}
            disabled={!selectedFile || uploading || !encryptionKey}
            className="w-full bg-[#2563EB] text-white py-3 px-6 rounded-xl hover:bg-[#1D4ED8] 
              disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2
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
                Encrypt & Upload to IPFS
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grant/Revoke Access Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Doctor Access Management */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#14B8A6]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Grant/Revoke Doctor Access</h2>
              <p className="text-sm text-[#475569]">Manage doctor viewing permissions</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Common Address Input */}
            <input
              type="text"
              placeholder="Doctor's wallet address (0x...)"
              value={doctorAddress}
              onChange={(e) => setDoctorAddress(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl 
                focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:border-transparent
                placeholder-gray-400 text-[#0F172A] transition-all duration-200 disabled:opacity-50"
              style={{background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(20, 184, 166, 0.15)'}}
            />

            {/* Grant and Revoke Buttons Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleGrantAccess}
                disabled={loading || !doctorAddress}
                className="bg-[#14B8A6] text-white px-4 py-3 rounded-xl hover:bg-[#0D9488] 
                  disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-[#14B8A6] focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {loading ? "..." : "Grant"}
              </button>

              <button
                onClick={handleRevokeAccess}
                disabled={loading || !doctorAddress}
                className="bg-[#EF4444] text-white px-4 py-3 rounded-xl hover:bg-[#DC2626] 
                  disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-[#EF4444] focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {loading ? "..." : "Revoke"}
              </button>
            </div>
          </div>

          <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl p-3 mt-4">
            <p className="text-xs text-[#0D9488] font-medium">Doctor must have the Doctor role assigned first</p>
          </div>
        </div>

        {/* Diagnostics Access Management */}
        <div className="floating-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#8B5CF6]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Grant/Revoke Diagnostics Access</h2>
              <p className="text-sm text-[#475569]">Manage lab upload permissions</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Common Address Input */}
            <input
              type="text"
              placeholder="Lab's wallet address (0x...)"
              value={diagnosticsAddress}
              onChange={(e) => setDiagnosticsAddress(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl 
                focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent
                placeholder-gray-400 text-[#0F172A] transition-all duration-200 disabled:opacity-50"
              style={{background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(139, 92, 246, 0.15)'}}
            />

            {/* Grant and Revoke Buttons Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleGrantDiagnosticsAccess}
                disabled={loading || !diagnosticsAddress}
                className="bg-[#8B5CF6] text-white px-4 py-3 rounded-xl hover:bg-[#7C3AED] 
                  disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {loading ? "..." : "Grant"}
              </button>

              <button
                onClick={handleRevokeDiagnosticsAccess}
                disabled={loading || !diagnosticsAddress}
                className="bg-[#EF4444] text-white px-4 py-3 rounded-xl hover:bg-[#DC2626] 
                  disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-[#EF4444] focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {loading ? "..." : "Revoke"}
              </button>
            </div>
          </div>

          <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl p-3 mt-4">
            <p className="text-xs text-[#7C3AED] font-medium">Lab must have the Diagnostics role assigned first</p>
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="lightweight-section p-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">My Health Records</h2>
              <p className="text-sm text-[#475569]">{records.length} records stored securely</p>
            </div>
          </div>
          <button
            onClick={loadRecords}
            disabled={loading}
            className="text-[#2563EB] hover:text-[#1D4ED8] font-semibold text-sm disabled:opacity-50 
              flex items-center gap-1.5 px-4 py-2 rounded-xl hover:bg-[#EFF6FF] transition-all duration-200 hover-glow"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : 'icon-rotate'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading && records.length === 0 ? (
          <div className="space-y-4">
            <div className="skeleton h-24 rounded-xl"></div>
            <div className="skeleton h-24 rounded-xl stagger-1"></div>
            <div className="skeleton h-24 rounded-xl stagger-2"></div>
            <p className="text-center text-[#475569] font-medium mt-6 animate-slide-up">Loading records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 bg-[#F8FAFC] rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-[#0F172A] font-semibold text-lg mb-1">No records yet</p>
            <p className="text-[#475569] text-sm">Upload your first health record above</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Patient Uploaded Records */}
            {patientRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-8 bg-[#2563EB] rounded-full"></div>
                  <h3 className="text-lg font-bold text-[#0F172A]">Patient Uploaded Records</h3>
                  <span className="px-3 py-1 bg-[#EFF6FF] text-[#2563EB] rounded-full text-xs font-bold">
                    {patientRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4 scrollbar-thin">
                  <div className="flex gap-4 min-w-max">
                    {patientRecords.map(record => renderRecordCard(record))}
                  </div>
                </div>
              </div>
            )}

            {/* Doctor Notes & Prescriptions */}
            {doctorRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-8 bg-[#14B8A6] rounded-full"></div>
                  <h3 className="text-lg font-bold text-[#0F172A]">Doctor Notes & Prescriptions</h3>
                  <span className="px-3 py-1 bg-[#F0FDFA] text-[#0D9488] rounded-full text-xs font-bold">
                    {doctorRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4 scrollbar-thin">
                  <div className="flex gap-4 min-w-max">
                    {doctorRecords.map(record => renderRecordCard(record))}
                  </div>
                </div>
              </div>
            )}

            {/* Diagnostic Test Reports */}
            {diagnosticsRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-8 bg-[#8B5CF6] rounded-full"></div>
                  <h3 className="text-lg font-bold text-[#0F172A]">Diagnostic Test Reports</h3>
                  <span className="px-3 py-1 bg-[#F5F3FF] text-[#8B5CF6] rounded-full text-xs font-bold">
                    {diagnosticsRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4 scrollbar-thin">
                  <div className="flex gap-4 min-w-max">
                    {diagnosticsRecords.map(record => renderRecordCard(record))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="floating-panel p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
            <svg className="w-6 h-6 text-[#2563EB]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-[#0F172A] font-bold text-lg mb-2">Your Data is Secure</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Files are encrypted client-side before upload
              </li>
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Encryption key derived from your wallet signature
              </li>
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Only encrypted data is stored on IPFS
              </li>
              <li className="flex items-center gap-2 text-sm text-[#475569]">
                <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Smart contract stores only CIDs, not personal data
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
