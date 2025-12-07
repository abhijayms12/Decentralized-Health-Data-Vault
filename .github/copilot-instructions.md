# Copilot Context File

This context file defines the exact rules, boundaries, and TODO instructions for GitHub Copilot to safely generate code for the **Decentralized Health Data Vault** project without breaking the Web3 setup.

Copilot must follow all constraints in this file.

---

# PROJECT SUMMARY

A decentralized health data vault using:

* Hardhat 2.22.10 + Hardhat Toolbox
* Solidity contracts deployed on Sepolia
* React + Tailwind frontend
* Ethers.js v6 (no web3.js)
* Pinata REST API (no IPFS SDKs)
* AES encryption for file privacy
* IPFS used only for encrypted files
* Smart contracts store ONLY CIDs and permissions

The system has 3–4 users:

* Patient
* Doctor
* Diagnostics
* Researcher (optional)

---

# GLOBAL RULES FOR COPILOT

1. **Do NOT install or suggest deprecated packages.**
   Forbidden libraries:

   * @pinata/sdk
   * @pinata/web3
   * ipfs-http-client
   * helia / @helia/*
   * web3.js

2. **Use ONLY:**

   * axios + FormData for all Pinata uploads
   * crypto-js for AES encryption
   * ethers.js v6 for blockchain interactions
   * Hardhat 2.22.10 structure

3. **Never write code that stores personal data on-chain.**

   * On-chain = only CIDs + permissions + timestamps.

4. All code must follow the folder structure described below.

5. Copilot must follow TODO comments EXACTLY.

---

# REQUIRED FOLDER STRUCTURE

```
health-vault/
│
├── contracts/
│   └── HealthVault.sol
│
├── scripts/
│   ├── deploy.js
│   └── utils/
│       └── pinataUpload.js
│
├── test/
│   └── HealthVault.test.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PatientDashboard.jsx
│   │   │   ├── DoctorDashboard.jsx
│   │   │   └── DiagnosticsDashboard.jsx
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── utils/
│   │   │   └── decrypt.js
│   │   └── App.jsx
│   └── package.json
│
├── ipfs/
│   └── encrypt.js
│
├── .env
├── hardhat.config.js
└── README.md
```

---

# TODO INSTRUCTIONS FOR COPILOT

These TODOs must be placed in specific files. Copilot must generate code only within these instructions.

## contracts/HealthVault.sol

```solidity
// TODO: Extend this contract with:
// 1. Roles for doctor and diagnostics.
// 2. A researcher role that can access anonymized metadata only.
// 3. Events for all permission changes.
// 4. A function to return only the most recent record.
// RULES:
// - Store ONLY CIDs, timestamps, and access permissions.
// - Do NOT store personal or medical data on-chain.
```

---

## scripts/deploy.js

```javascript
// TODO: After deploying the HealthVault contract, write code to
// automatically save the deployed address inside
// frontend/src/utils/contractAddress.json.
```

---

## scripts/utils/pinataUpload.js

```javascript
// TODO: Write a function uploadFile(filePath) that:
// 1. Uploads a file to Pinata using axios + REST API.
// 2. Uses .env keys (PINATA_API_KEY, PINATA_SECRET_API_KEY).
// 3. Returns ONLY the CID.
// 4. Does NOT use any deprecated Pinata or IPFS SDK.
// 5. Must catch and log errors cleanly.
```

---

## ipfs/encrypt.js

```javascript
// TODO: Implement two functions:
// encryptFile(inputPath, outputPath) → writes encrypted file.
// decryptContent(encryptedText) → returns Buffer.
// Use AES via crypto-js.
// Do not modify other filesystem logic.
```

---

## frontend/src/components/PatientDashboard.jsx

```jsx
// TODO: Build a UI that:
// 1. Allows file upload → sends file to backend → receives CID.
// 2. Calls addRecord(cid) on the smart contract.
// 3. Displays all records for the connected patient.
// 4. Has a form to grant access to a doctor.
// RULES:
// - Use ethers.js v6.
// - Do NOT use web3.js.
// - Do NOT interact with IPFS directly.
```

---

## frontend/src/components/DoctorDashboard.jsx

```jsx
// TODO: Build a UI that:
// 1. Takes a patient address as input.
// 2. Calls getRecords(patientAddress).
// 3. Fetches files via https://gateway.pinata.cloud/ipfs/<CID>.
// 4. Displays decrypted files if needed.
// - Handle "Not authorized" errors gracefully.
```

---

## frontend/src/utils/decrypt.js

```javascript
// TODO: Write decryptFile(encryptedText) using AES decryption
// with ENCRYPTION_KEY.
// Output must be a Blob for rendering or download.
```

---

# GLOBAL CODING REQUIREMENTS FOR COPILOT

Copilot must follow these:

### Allowed imports

```javascript
import { ethers } from "ethers";
import axios from "axios";
import FormData from "form-data";
import CryptoJS from "crypto-js";
```

### Forbidden imports

```javascript
import IPFS from "ipfs-http-client";
import pinataSDK from "@pinata/sdk";
import { PinataSDK } from "@pinata/web3";
import Web3 from "web3";
```

### Correct IPFS Gateway

```
https://gateway.pinata.cloud/ipfs/<CID>
```

### Smart contract interaction must use ethers v6

Example pattern:

```javascript
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(address, abi, signer);
```

---

# END OF CONTEXT FILE

Copilot must obey all rules and TODO blocks exactly.
Do not generate code outside these boundaries.
