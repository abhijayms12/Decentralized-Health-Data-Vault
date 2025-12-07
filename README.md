# Decentralized Health Data Vault

A blockchain-based system that gives patients full ownership of their health records while enabling secure, permissioned access for doctors, diagnostic labs, and researchers.

## 1. Overview

The health data ecosystem today suffers from fragmented records, poor interoperability, data tampering risks, and a lack of patient control. This project addresses these issues by using blockchain, IPFS, and cryptographic hashing to create a tamper-proof, decentralized health vault.

Patients store their medical records on IPFS, and the blockchain holds only metadata and permissions. Access control is enforced through smart contracts, ensuring that data can only be viewed by authorized users.

This project is built as part of the Design Thinking Lab (DTL) course.

## 2. Key Features

### For Patients

* View own health records
* Upload new medical documents
* Grant/revoke doctor access
* Receive diagnostic lab reports
* Audit log for data access

### For Doctors

* Access patient records when permission is granted
* Add prescriptions or notes
* Cannot view unauthorized records

### For Diagnostics Labs

* Upload lab reports to a patient profile
* Cannot view unrelated patient data

### For Researchers (Optional)

* Request anonymized datasets
* No access to identity-linked information

## 3. System Architecture

```
User (Patient/Doctor/Lab)
        ↓
React Frontend (Ethers.js + Wallet Integration)
        ↓
Smart Contracts (Solidity on Ethereum Sepolia)
        ↓
IPFS via Pinata (File Storage)
        ↓
Blockchain Stores:
- IPFS CIDs
- Access permissions
- Event logs
```

## 4. Tech Stack

### Blockchain / Smart Contract Layer

* Ethereum Sepolia Testnet
* Solidity
* Hardhat
* Ethers.js
* OpenZeppelin Contracts
* MetaMask

### Storage

* IPFS via Pinata
* SHA-256 hashing

### Frontend

* React.js
* Tailwind CSS
* Web3Modal / MetaMask integration

### Backend (Optional)

* Node.js
* Express

### Version Control

* Git & GitHub

## 5. Functional Workflow

### 1. Patient uploads document

* File hashed using SHA-256
* File uploaded to IPFS
* CID stored on-chain
* Patient manages access

### 2. Doctor requests access

* Patient grants access
* Doctor retrieves CID from blockchain
* Fetches file from IPFS

### 3. Diagnostic lab uploads report

* Lab adds CID
* No access to unrelated records

### 4. Researcher workflow

* Receives anonymized datasets
* No identity-linked access

## 6. Smart Contract Responsibilities

* Register and authenticate users
* Maintain access-control lists
* Store IPFS CIDs
* Emit events for system actions
* Enforce role-based permissions

## 7. Folder Structure

```
health-vault/
│
├── contracts/
│   └── HealthVault.sol              # Main smart contract
│
├── scripts/
│   ├── deploy.js                    # Deployment script
│   └── utils/
│       └── pinataUpload.js          # Pinata REST API upload utility
│
├── test/
│   └── HealthVault.test.js          # Contract tests
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PatientDashboard.jsx
│   │   │   ├── DoctorDashboard.jsx
│   │   │   └── DiagnosticsDashboard.jsx
│   │   ├── utils/
│   │   │   ├── decrypt.js           # AES decryption utility
│   │   │   ├── contractAddress.json # Generated after deployment
│   │   │   └── HealthVaultABI.json  # Generated after compilation
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── App.jsx                  # Main app component
│   │   ├── main.jsx                 # Entry point
│   │   └── index.css                # Tailwind styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── ipfs/
│   └── encrypt.js                   # AES encryption utility
│
├── .env                             # Environment variables (DO NOT COMMIT)
├── .env.example                     # Template for .env
├── hardhat.config.js                # Hardhat configuration
├── package.json                     # Root package.json
└── README.md
```

## 8. Installation & Setup

### Prerequisites

* Node.js (v16 or higher)
* Git
* VS Code (recommended)
* MetaMask wallet
* Pinata account (for IPFS)
* Sepolia testnet RPC URL (Alchemy/Infura)

### Step 1: Clone Repository

```bash
git clone https://github.com/your-username/health-data-vault.git
cd health-data-vault
```

### Step 2: Install Root Dependencies

```bash
npm install
```

This installs:
- Hardhat 2.22.10
- @nomicfoundation/hardhat-toolbox
- ethers v6
- dotenv
- axios
- form-data
- crypto-js

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_wallet_private_key_without_0x
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_API_KEY=your_pinata_secret_api_key
ENCRYPTION_KEY=your_32_byte_encryption_key
```
## 9. Usage Guide

### As a Patient

1. Connect wallet and select "Patient" role
2. Upload health records (files will be encrypted automatically)
3. Grant access to doctors by entering their wallet address
4. View all your records with timestamps and CIDs
5. Revoke doctor access anytime

### As a Doctor

1. Connect wallet and select "Doctor" role
2. Enter patient's wallet address
3. If authorized, view patient's health records
4. Download and decrypt files automatically
5. If not authorized, patient must grant you access first

### As a Diagnostics Lab

1. Connect wallet and select "Diagnostics" role
2. Enter patient's wallet address
3. Upload diagnostic reports (requires patient permission)
4. Reports are encrypted and stored on IPFS
5. Cannot view other patient records

### As a Researcher

1. Connect wallet and select "Researcher" role
2. Access anonymized metadata only
3. No access to CIDs or patient identities

## 10. Architecture Details

### Smart Contract Functions

**Role Management:**
- `assignRole(address, role)` - Assign roles to users
- `roles(address)` - Get user role

**Patient Functions:**
- `addRecord(cid)` - Add health record
- `grantDoctorAccess(doctor)` - Grant doctor access
- `revokeDoctorAccess(doctor)` - Revoke doctor access
- `grantDiagnosticsAccess(lab)` - Allow lab to upload
- `revokeDiagnosticsAccess(lab)` - Revoke lab access

**Doctor Functions:**
- `getRecords(patient)` - View patient records (if authorized)
- `getMostRecentRecord(patient)` - Get latest record
- `getRecordCount(patient)` - Get number of records

**Diagnostics Functions:**
- `addDiagnosticRecord(patient, cid)` - Upload diagnostic report

**Researcher Functions:**
- `getAnonymizedMetadata()` - Access anonymized data

**Access Check Functions:**
- `hasDoctorAccess(patient, doctor)` - Check doctor permission
- `hasDiagnosticsAccess(patient, lab)` - Check lab permission

### Events

- `RecordAdded(patient, cid, timestamp, uploader)`
- `AccessGranted(patient, accessor, role)`
- `AccessRevoked(patient, accessor, role)`
- `RoleAssigned(user, role)`

### Encryption Flow

**Encryption (Backend):**
1. Read file from filesystem
2. Convert to base64
3. Encrypt using AES with `ENCRYPTION_KEY`
4. Upload encrypted text to Pinata
5. Return CID

**Decryption (Frontend):**
1. Fetch encrypted content from `https://gateway.pinata.cloud/ipfs/<CID>`
2. Decrypt using AES with `VITE_ENCRYPTION_KEY`
3. Convert to Blob for download/preview

### Technology Constraints

**✅ ALLOWED:**
## 12. Security Considerations

### ✅ What's Secure

- **No sensitive data on-chain**: Only IPFS CIDs, timestamps, and permissions stored
- **AES encryption**: All files encrypted before upload to IPFS
- **Access control**: Smart contract enforces role-based permissions
- **Event logging**: All permission changes emit events for auditability
- **Revocable access**: Patients can revoke doctor/lab access anytime
- **MetaMask integration**: Private keys never exposed to application

### ⚠️ Important Notes

- **Encryption key management**: In production, use secure key management (HSM, AWS KMS, etc.)
- **Frontend keys**: Never hardcode encryption keys in frontend code
- **Private keys**: Never commit `.env` files or expose private keys
- **IPFS persistence**: Use Pinata pinning to ensure file availability
- **Gas optimization**: Batch operations when possible to reduce costs

### 🔒 Best Practices

1. Use environment variables for all secrets
2. Rotate encryption keys periodically
3. Implement multi-signature for critical operations
4. Regular smart contract audits before mainnet
5. Use HTTPS for all API calls
6. Validate all inputs on frontend and contract level

## 13. Limitations & Future Work

### Current Limitations

- **Gas costs**: Each transaction requires gas fees on Sepolia/Ethereum
- **IPFS availability**: Files depend on Pinata's service availability
- **Scalability**: On-chain storage costs increase with number of records
- **Key management**: Encryption keys must be managed securely by users
- **Network dependency**: Requires Sepolia testnet connection

### Future Enhancements

- **Zero-Knowledge Proofs**: Prove authorization without revealing identity
- **Attribute-Based Encryption**: Fine-grained access control
- **HL7/FHIR Integration**: Interoperability with existing health systems
- **Decentralized Identity**: Self-sovereign identity using DIDs
- **Layer 2 Solutions**: Reduce gas costs using Polygon/Optimism
- **Automated anonymization**: AI-powered data de-identification
- **Mobile app**: React Native mobile application
- **IPFS node clustering**: Redundant storage across multiple nodes
- **Time-based access**: Automatic access expiration
- **Emergency access**: Break-glass mechanism for emergencies
- web3.js
- @pinata/sdk
- @pinata/web3
- ipfs-http-client
- helia / @helia/*

## 11. Testing

Run all tests:
```bash
npx hardhat test
```

Run specific test:
```bash
npx hardhat test --grep "should allow patient to add a record"
```

Test coverage includes:
- Role assignment
- Record addition and retrieval
- Access control (grant/revoke)
- Doctor authorization
- Diagnostics permissions
- Researcher metadata access
- Error handling and edge cases

```bash
npx hardhat test
```

All tests should pass before deployment.

### Step 6: Deploy to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

This will:
1. Deploy the HealthVault contract
2. Save contract address to `frontend/src/utils/contractAddress.json`
3. Save ABI to `frontend/src/utils/HealthVaultABI.json`

### Step 7: Install Frontend Dependencies

```bash
cd frontend
npm install
```

This installs:
- React
- Vite
- Tailwind CSS
- ethers v6
- axios
- crypto-js

### Step 8: Configure Frontend Environment

Create `frontend/.env`:

## 14. Troubleshooting

### Contract deployment fails

- Check `.env` has valid `SEPOLIA_RPC_URL` and `PRIVATE_KEY`
- Ensure wallet has Sepolia ETH (use faucet: https://sepoliafaucet.com/)
- Verify network name in hardhat.config.js matches deployment command

### Frontend can't find contract

- Run deployment script first: `npx hardhat run scripts/deploy.js --network sepolia`
- Check `frontend/src/utils/contractAddress.json` exists
- Check `frontend/src/utils/HealthVaultABI.json` exists

### MetaMask connection issues

- Ensure MetaMask is installed
- Switch to Sepolia testnet in MetaMask
- Clear MetaMask activity and nonce data if stuck
- Try disconnecting and reconnecting wallet

### File encryption/decryption fails

- Verify `ENCRYPTION_KEY` in `.env` matches `VITE_ENCRYPTION_KEY` in `frontend/.env`
- Key must be same for encryption and decryption
- Check console for detailed error messages

### "Not authorized" errors

- Patient must grant access first using wallet address
- Verify correct role assigned (use `assignRole` function)
- Check `hasDoctorAccess` or `hasDiagnosticsAccess` returns true

### Pinata upload fails

- Verify `PINATA_API_KEY` and `PINATA_SECRET_API_KEY` in `.env`
- Check Pinata account has available storage
- Test API keys using Pinata dashboard

## 15. Development Commands

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy to local network
npx hardhat node                          # Terminal 1
npx hardhat run scripts/deploy.js --network localhost  # Terminal 2

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Clean artifacts
npx hardhat clean

# Frontend development
cd frontend
npm run dev

# Frontend build
cd frontend
npm run build

# Frontend preview
cd frontend
npm run preview
```

## 16. Contributors

* **Abhijay MS** - [@abhijayms12](https://github.com/abhijayms12)
* Design Thinking Lab (DTL) Course Project

## 17. License

MIT License - see LICENSE file for details

Frontend will be available at `http://localhost:3000`

### Step 10: Connect MetaMask

1. Open the app in your browser
2. Click "Connect Wallet"
3. Approve connection in MetaMask
4. Make sure you're on Sepolia testnet
5. Select your role (Patient/Doctor/Diagnostics/Researcher)

## 9. Security Considerations

* Only metadata stored on-chain
* IPFS CIDs are content-hashed
* Smart contracts enforce strict access control
* Private keys not stored in code
* Files hashed using SHA-256
* Doctor access fully revocable

## 10. Limitations

* Sensitive data cannot be stored on-chain
* IPFS data is public unless encrypted
* Gas costs depend on usage scale

## 11. Future Work

* Zero-Knowledge Proof integration
* Attribute-based encryption
* HL7/FHIR interoperability
* Automated anonymization pipelines
* On-chain analytics

## 12. Contributors

* Abhi
* Team Members
* DTL Course Instructors

## 13. License

MIT License
