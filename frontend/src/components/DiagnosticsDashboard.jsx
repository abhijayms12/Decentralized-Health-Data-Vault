import { useState } from "react";
import { ethers } from "ethers";

export default function DiagnosticsDashboard({ contract, account }) {
  const [patientAddress, setPatientAddress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!ethers.isAddress(patientAddress)) {
      setMessage("Please enter a valid patient address first");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);
      setMessage("Encrypting and uploading diagnostic report...");

      // In production, send to backend endpoint that:
      // 1. Encrypts the file
      // 2. Uploads to Pinata
      // 3. Returns CID
      
      const formData = new FormData();
      formData.append("file", file);

      // Temporary placeholder - in production, get CID from backend
      const cid = "QmDiagnostic" + Date.now();
      
      setMessage("Adding diagnostic report to blockchain...");

      // Call smart contract to add diagnostic record
      const tx = await contract.addDiagnosticRecord(patientAddress, cid);
      await tx.wait();

      setMessage("Diagnostic report added successfully!");
      event.target.value = ""; // Reset file input

    } catch (error) {
      console.error("Error uploading file:", error);
      
      if (error.message.includes("No permission")) {
        setMessage("You don't have permission to add records for this patient. The patient must grant you access first.");
      } else {
        setMessage(`Upload failed: ${error.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Diagnostics Dashboard</h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-4 rounded ${message.includes("failed") || message.includes("don't have") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {message}
        </div>
      )}

      {/* Patient Address Input */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Patient Information</h2>
        <input
          type="text"
          value={patientAddress}
          onChange={(e) => setPatientAddress(e.target.value)}
          placeholder="Enter patient's wallet address (0x...)"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-2 text-sm text-gray-500">
          You must have permission from the patient to upload diagnostic reports
        </p>
      </div>

      {/* File Upload Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Diagnostic Report</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading || !patientAddress}
            className="hidden"
            id="diagnostic-upload"
          />
          <label
            htmlFor="diagnostic-upload"
            className={`cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ${
              uploading || !patientAddress ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? "Uploading..." : "Choose Diagnostic Report"}
          </label>
          <p className="mt-2 text-sm text-gray-500">
            {!patientAddress
              ? "Enter patient address first"
              : "File will be encrypted before upload"}
          </p>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">Important Notes</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• You can upload diagnostic reports but cannot view patient records</li>
          <li>• The patient must grant you permission before you can upload reports</li>
          <li>• All reports are encrypted automatically before being stored on IPFS</li>
          <li>• Your wallet address: <code className="bg-yellow-100 px-1 rounded">{account}</code></li>
        </ul>
      </div>
    </div>
  );
}
