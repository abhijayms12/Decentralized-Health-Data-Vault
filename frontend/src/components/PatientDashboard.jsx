import { useState, useEffect } from "react";
import { ethers } from "ethers";
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
        return { label: 'Patient', color: 'bg-blue-100 text-blue-700' };
      case 'doctor':
        return { label: 'Doctor', color: 'bg-green-100 text-green-700' };
      case 'diagnostics':
        return { label: 'Diagnostics', color: 'bg-purple-100 text-purple-700' };
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
        className="flex-shrink-0 w-72 border-2 border-gray-200 rounded-lg p-4 hover:shadow-lg hover:border-blue-300 transition bg-white"
      >
        {/* Header with badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 text-base truncate mb-1" title={filename}>
              {filename}
            </h4>
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          <svg className="w-6 h-6 text-red-500 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
          </svg>
        </div>

        {/* Date */}
        <div className="text-sm text-gray-600 mb-2">
          <svg className="w-4 h-4 inline mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formatDate(record.timestamp)}
        </div>

        {/* CID */}
        <div className="mb-4">
          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 break-all">
            {shortCID}
          </code>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => handleViewRecord(record)}
            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 
              font-medium text-sm transition flex items-center justify-center gap-1"
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
            className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 
              font-medium text-sm transition flex items-center justify-center gap-1"
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
    <div className="space-y-6">
      {/* Status Message */}
      {message.text && (
        <div className={`p-4 rounded-lg ${
          message.type === "success" ? "bg-green-100 text-green-700" :
          message.type === "error" ? "bg-red-100 text-red-700" :
          "bg-blue-100 text-blue-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* ⚠️ MOCK IPFS WARNING */}
      {import.meta.env.VITE_LIGHTHOUSE_API_KEY === undefined || 
       import.meta.env.VITE_LIGHTHOUSE_API_KEY === "" || 
       import.meta.env.VITE_LIGHTHOUSE_API_KEY === "your_lighthouse_api_key_here" ? (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-yellow-800 font-semibold mb-1">⚠️ Development Mode: Files NOT Persistent</h3>
              <p className="text-yellow-700 text-sm mb-2">
                Mock IPFS is active. Uploaded files are stored in browser memory and will be <strong>LOST when you close the browser or refresh the page</strong>.
              </p>
              <p className="text-yellow-700 text-sm">
                <strong>To enable persistent storage:</strong> Set up Lighthouse API key in <code className="bg-yellow-100 px-1 rounded">.env</code> file or implement Express backend server (see <code>QUICKSTART.md</code>).
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* File Upload Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Upload Health Record</h2>
        <p className="text-gray-600 mb-4">
          Upload PDF files (encrypted before storage on IPFS)
        </p>

        {!encryptionKey && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2">
              🔐 Encryption key not configured. Please add VITE_ENCRYPTION_KEY to your .env file and restart the dev server.
            </p>
            <p className="text-xs text-yellow-700">
              Ask the project owner for the shared encryption key value.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select PDF File
            </label>
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={uploading || !encryptionKey}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {selectedFile && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">
                ({(selectedFile.size / 1024).toFixed(2)} KB)
              </span>
            </div>
          )}

          {uploadProgress && (
            <div className="text-sm text-blue-600 font-medium">
              {uploadProgress}
            </div>
          )}

          <button
            onClick={handleFileUpload}
            disabled={!selectedFile || uploading || !encryptionKey}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 
              disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition"
          >
            {uploading ? "Uploading..." : "Encrypt & Upload to IPFS"}
          </button>
        </div>
      </div>

      {/* Grant Access Section - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Grant Doctor Access */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            Grant Doctor Access
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            Allow a doctor to view your health records
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Doctor's address (0x...)"
              value={doctorAddress}
              onChange={(e) => setDoctorAddress(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 
                focus:ring-green-500 focus:border-transparent disabled:opacity-50 text-sm"
            />
            <button
              onClick={handleGrantAccess}
              disabled={loading || !doctorAddress}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 
                disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition text-sm"
            >
              {loading ? "Granting..." : "Grant Access"}
            </button>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
              <p className="font-semibold mb-1">✓ Required:</p>
              <ul className="list-disc list-inside space-y-0.5 text-green-700">
                <li>Doctor must have Doctor role assigned</li>
                <li>Enter their wallet address</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Grant Diagnostics Access */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Grant Diagnostics Access
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            Allow a lab to upload diagnostic reports
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Lab's address (0x...)"
              value={diagnosticsAddress}
              onChange={(e) => setDiagnosticsAddress(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 
                focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-sm"
            />
            <button
              onClick={handleGrantDiagnosticsAccess}
              disabled={loading || !diagnosticsAddress}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 
                disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition text-sm"
            >
              {loading ? "Granting..." : "Grant Access"}
            </button>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800">
              <p className="font-semibold mb-1">✓ Required:</p>
              <ul className="list-disc list-inside space-y-0.5 text-purple-700">
                <li>Lab must have Diagnostics role assigned</li>
                <li>They can upload reports to your vault</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">My Health Records</h2>
          <button
            onClick={loadRecords}
            disabled={loading}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading && records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading records...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-lg">No records yet</p>
            <p className="text-gray-400 text-sm mt-1">Upload your first health record above</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Patient Uploaded Records */}
            {patientRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-blue-500 rounded"></div>
                  <h3 className="text-lg font-bold text-gray-800">Patient Uploaded Records</h3>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                    {patientRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4">
                  <div className="flex gap-4 min-w-max">
                    {patientRecords.map(record => renderRecordCard(record))}
                  </div>
                </div>
              </div>
            )}

            {/* Doctor Notes & Prescriptions */}
            {doctorRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-green-500 rounded"></div>
                  <h3 className="text-lg font-bold text-gray-800">Doctor Notes & Prescriptions</h3>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                    {doctorRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4">
                  <div className="flex gap-4 min-w-max">
                    {doctorRecords.map(record => renderRecordCard(record))}
                  </div>
                </div>
              </div>
            )}

            {/* Diagnostic Test Reports */}
            {diagnosticsRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-purple-500 rounded"></div>
                  <h3 className="text-lg font-bold text-gray-800">Diagnostic Test Reports</h3>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                    {diagnosticsRecords.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-4">
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">🔒 Your data is secure</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Files are encrypted client-side before upload</li>
              <li>Encryption key derived from your wallet signature</li>
              <li>Only encrypted data is stored on IPFS</li>
              <li>Smart contract stores only CIDs, not personal data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
