# Additional Context for Copilot  
This file provides high-level project context so Copilot understands the purpose, constraints, and architecture of the Decentralized Health Data Vault project.

---

# PROJECT PURPOSE
The goal is to build a decentralized system that gives patients full ownership of their medical records, ensures secure and permission-controlled sharing, and avoids storing any sensitive data on centralized servers.

The system must:
- Allow patients to upload encrypted health documents.
- Store only IPFS CIDs on chain.
- Enable doctors to access records only with permission.
- Allow diagnostics labs to upload reports but not read data.
- Optionally provide anonymized data to researchers.

---

# USER ROLES (Copilot must respect these)

### Patient
- Upload encrypted files → generate CID → store CID on chain.
- Grant/revoke doctor access.
- View own records.
- Receive diagnostic reports.

### Doctor
- View records only when patient grants access.
- Retrieve CIDs from contract and fetch the encrypted file.
- Add notes (optional, stored as CIDs).

### Diagnostics
- Upload reports (encrypted file → CID).
- Cannot read patient records.

### Researcher (Optional)
- Can read anonymized metadata only.
- No record-level or identity-level access.

---

# ARCHITECTURE OVERVIEW
The system follows a strict hybrid storage model:

### On-chain (Ethereum Sepolia):
- CIDs (string)
- Access permissions
- Roles
- Timestamps
- Nothing else

### Off-chain:
- Encrypted documents stored on IPFS (Pinata REST API)
- Decryption handled client-side

### Frontend:
- React + Tailwind + ethers.js v6
- MetaMask for wallet interactions

### Backend (optional):
- Node.js service for encrypting and uploading files to Pinata via REST API

---

# SECURITY RULES FOR ALL GENERATED CODE
Copilot must obey these for all files:

1. **Do NOT store any plaintext medical data anywhere.**  
2. **All files must be encrypted with AES (crypto-js) before upload.**  
3. **Only CIDs may be written into the smart contract.**  
4. **All contract calls must use ethers.js v6 syntax.**  
5. **Never use deprecated packages or SDKs.**  
6. **Never interact with IPFS through client libraries—use REST API only.**  
7. **Frontend must never contain API keys.**  
8. **Only backend scripts may read .env.**

---

# SMART CONTRACT RULES
Copilot must follow:

- Contracts must be compatible with Hardhat 2.22.10.
- Solidity version must be `^0.8.20`.
- Must use events for:
  - RecordAdded
  - AccessGranted
  - AccessRevoked
- Must include structure for:
  - Patient records (array of `Record(cid, timestamp)`)
  - Access control mapping
  - Role-based permissions for diagnostics and researcher

---

# FRONTEND RULES
Copilot must:

- Use ethers.js v6.
- Never import web3.js.
- Use a provider pattern:

```js
const provider = new ethers.BrowserProvider(win
