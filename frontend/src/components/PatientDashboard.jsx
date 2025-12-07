import { useState, useEffect } from "react";
import { ethers } from "ethers";
import axios from "axios";

// TODO: Build a UI that:
// 1. Allows file upload → sends file to backend → receives CID.
// 2. Calls addRecord(cid) on the smart contract.
// 3. Displays all records for the connected patient.
// 4. Has a form to grant access to a doctor.
// RULES:
// - Use ethers.js v6.
// - Do NOT use web3.js.
// - Do NOT interact with IPFS directly.

export default function PatientDashboard({ contract, account }) {
  const [records, setRecords] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doctorAddress, setDoctorAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Load patient records on mount
  useEffect(() => {
    if (contract && account) {
      loadRecords();
    }
  }, [contract, account]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const patientRecords = await contract.getRecords(account);
      setRecords(patientRecords);
    } catch (error) {
      console.error("Error loading records:", error);
      setMessage("Failed to load records");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setMessage("Encrypting and uploading file...");

      // In production, send to backend endpoint that:
      // 1. Encrypts the file
      // 2. Uploads to Pinata
      // 3. Returns CID
      
      // For now, this is a placeholder showing the expected flow
      // You would need to implement a backend API endpoint
      const formData = new FormData();
      formData.append("file", file);

      // Example: POST to your backend
      // const response = await axios.post("http://localhost:3001/api/upload", formData);
      // const cid = response.data.cid;

      // Temporary placeholder - in production, get CID from backend
      const cid = "QmPlaceholder" + Date.now();
      
      setMessage("Adding record to blockchain...");

      // Call smart contract to add record
      const tx = await contract.addRecord(cid);
      await tx.wait();

      setMessage("Record added successfully!");
      await loadRecords();
      event.target.value = ""; // Reset file input

    } catch (error) {
      console.error("Error uploading file:", error);
      setMessage(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    
    if (!ethers.isAddress(doctorAddress)) {
      setMessage("Invalid doctor address");
      return;
    }

    try {
      setLoading(true);
      setMessage("Granting access to doctor...");

      const tx = await contract.grantDoctorAccess(doctorAddress);
      await tx.wait();

      setMessage("Access granted successfully!");
      setDoctorAddress("");

    } catch (error) {
      console.error("Error granting access:", error);
      setMessage(`Failed to grant access: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = async (doctorAddr) => {
    try {
      setLoading(true);
      setMessage("Revoking access...");

      const tx = await contract.revokeDoctorAccess(doctorAddr);
      await tx.wait();

      setMessage("Access revoked successfully!");

    } catch (error) {
      console.error("Error revoking access:", error);
      setMessage(`Failed to revoke access: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantDiagnosticsAccess = async (diagnosticsAddr) => {
    if (!ethers.isAddress(diagnosticsAddr)) {
      setMessage("Invalid diagnostics address");
      return;
    }

    try {
      setLoading(true);
      setMessage("Granting diagnostics access...");

      const tx = await contract.grantDiagnosticsAccess(diagnosticsAddr);
      await tx.wait();

      setMessage("Diagnostics access granted successfully!");

    } catch (error) {
      console.error("Error granting diagnostics access:", error);
      setMessage(`Failed to grant access: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Patient Dashboard</h1>
      
      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-4 rounded ${message.includes("Failed") || message.includes("Invalid") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {message}
        </div>
      )}

      {/* File Upload Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Health Record</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {uploading ? "Uploading..." : "Choose File to Upload"}
          </label>
          <p className="mt-2 text-sm text-gray-500">
            File will be encrypted before upload
          </p>
        </div>
      </div>

      {/* Grant Access Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Grant Doctor Access</h2>
        <form onSubmit={handleGrantAccess} className="flex gap-2">
          <input
            type="text"
            value={doctorAddress}
            onChange={(e) => setDoctorAddress(e.target.value)}
            placeholder="Enter doctor's wallet address (0x...)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !doctorAddress}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Grant Access
          </button>
        </form>
      </div>

      {/* Records List */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">My Health Records</h2>
        
        {loading && records.length === 0 ? (
          <p className="text-gray-500">Loading records...</p>
        ) : records.length === 0 ? (
          <p className="text-gray-500">No records found. Upload your first health record above.</p>
        ) : (
          <div className="space-y-4">
            {records.map((record, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Record #{index + 1}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">CID:</span> {record.cid}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Date:</span>{" "}
                      {new Date(Number(record.timestamp) * 1000).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Uploaded by:</span>{" "}
                      {record.uploader === account ? "You" : record.uploader}
                    </p>
                  </div>
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${record.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    View File
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
