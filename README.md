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
project-root/
│
├── contracts/
│   └── HealthVault.sol
│
├── scripts/
│   ├── deploy.js
│   └── interact.js
│
├── test/
│   └── healthVault.test.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   └── package.json
│
├── ipfs/
│   └── ipfsClient.js
│
├── .env
├── hardhat.config.js
└── README.md
```

## 8. Installation & Setup

### Prerequisites

* Node.js
* Git
* VS Code
* MetaMask wallet
* Pinata account
* Alchemy/Infura RPC URL

### Step 1: Clone Repository

```
git clone https://github.com/your-username/health-data-vault.git
cd health-data-vault
```

### Step 2: Install Dependencies

```
npm install
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install ethers dotenv @openzeppelin/contracts ipfs-http-client crypto-js
```

### Step 3: Configure Hardhat

Add your `.env`:

```
SEPOLIA_RPC_URL=YOUR_RPC_URL
PRIVATE_KEY=YOUR_METAMASK_PRIVATE_KEY
```

### Step 4: Compile & Deploy Contracts

```
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

### Step 5: Run Frontend

```
cd frontend
npm install
npm run dev
```

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
