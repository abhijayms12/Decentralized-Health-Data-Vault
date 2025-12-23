import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { deriveEncryptionKey, encryptFile, decryptFile, storeKey, retrieveKey } from "../utils/encryption";
import { uploadToIPFS, downloadFromIPFS, getIPFSGatewayURL } from "../utils/ipfs";

export default function PatientDashboard({ contract, account }) {
  const [records, setRecords] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doctorAddress, setDoctorAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");

  // Load patient records and encryption key on mount
  useEffect(() => {
    if (contract && account) {
      loadRecords();
      initializeEncryptionKey();
    }
  }, [contract, account]);

  // Initialize encryption key from wallet signature
  const initializeEncryptionKey = async () => {
    try {
      // Check if key exists in session
      let key = await retrieveKey();
      
      if (!key) {
        // Derive new key from wallet signature
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        showMessage("info", "Please sign message to derive encryption key...");
        key = await deriveEncryptionKey(signer);
        await storeKey(key);
        showMessage("success", "Encryption key initialized");
      }
      
      setEncryptionKey(key);
    } catch (error) {
      console.error("Failed to initialize encryption key:", error);
      showMessage("error", "Failed to initialize encryption: " + error.message);
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
      console.log("File read:", fileData.byteLength, "bytes");

      // 2. Encrypt the file
      setUploadProgress("Encrypting file...");
      const { encryptedData } = await encryptFile(fileData, encryptionKey);
      console.log("File encrypted:", encryptedData.length, "bytes");

      // 3. Upload to IPFS
      setUploadProgress("Uploading to IPFS...");
      const cid = await uploadToIPFS(encryptedData, selectedFile.name);
      console.log("Uploaded to IPFS, CID:", cid);

      // 4. Store CID on blockchain
      setUploadProgress("Storing record on blockchain...");
      const tx = await contract.addRecord(cid);
      console.log("Transaction sent:", tx.hash);
      
      setUploadProgress("Waiting for confirmation...");
      await tx.wait();
      console.log("Transaction confirmed");

      // 5. Success!
      showMessage("success", `✓ Record added successfully! CID: ${cid.substring(0, 20)}...`);
      setSelectedFile(null);
      setUploadProgress("");
      
      // Reset file input
      document.getElementById("file-input").value = "";
      
      // Reload records
      await loadRecords();

    } catch (error) {
      console.error("Upload failed:", error);
      showMessage("error", "Upload failed: " + error.message);
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  // Download and decrypt a record
  const handleDownloadRecord = async (record) => {
    if (!encryptionKey) {
      showMessage("error", "Encryption key not available");
      return;
    }

    try {
      showMessage("info", "Downloading and decrypting file...");

      // 1. Download from IPFS
      const encryptedData = await downloadFromIPFS(record.cid);
      console.log("Downloaded from IPFS:", encryptedData.length, "bytes");

      // 2. Decrypt the file
      const decryptedData = await decryptFile(encryptedData, encryptionKey);
      console.log("File decrypted:", decryptedData.byteLength, "bytes");

      // 3. Create blob and download
      const blob = new Blob([decryptedData], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-record-${record.id}-${new Date(record.timestamp * 1000).toLocaleDateString()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage("success", "✓ File downloaded successfully");

    } catch (error) {
      console.error("Download failed:", error);
      showMessage("error", "Download failed: " + error.message);
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

    try {
      setLoading(true);
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
        errorMsg += "This address is not registered as a doctor";
      } else if (error.message.includes("ACTION_REJECTED")) {
        errorMsg += "Transaction rejected";
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

      {/* File Upload Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Upload Health Record</h2>
        <p className="text-gray-600 mb-4">
          Upload PDF files (encrypted before storage on IPFS)
        </p>

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

      {/* Grant Access Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Grant Doctor Access</h2>
        <p className="text-gray-600 mb-4">
          Allow a doctor to view your health records
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Doctor's Ethereum address (0x...)"
            value={doctorAddress}
            onChange={(e) => setDoctorAddress(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 
              focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={handleGrantAccess}
            disabled={loading || !doctorAddress}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 
              disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition"
          >
            {loading ? "Granting..." : "Grant Access"}
          </button>
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">My Health Records</h2>
          <button
            onClick={loadRecords}
            disabled={loading}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm disabled:opacity-50"
          >
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        {loading && records.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Loading records...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No records yet. Upload your first health record above.
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                      <span className="font-medium text-gray-900">
                        Health Record #{record.id + 1}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Date:</span>
                        <span>{formatDate(record.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">CID:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {record.cid.substring(0, 30)}...
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Uploaded by:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {shortenAddress(record.uploader)}
                        </code>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadRecord(record)}
                    className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg 
                      hover:bg-blue-700 font-semibold text-sm transition flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download
                  </button>
                </div>
              </div>
            ))}
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
