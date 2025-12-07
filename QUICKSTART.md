# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites Checklist
- [ ] Node.js v16+ installed
- [ ] MetaMask browser extension installed
- [ ] Sepolia testnet ETH (get from https://sepoliafaucet.com/)
- [ ] Pinata account (https://pinata.cloud/)

---

## Step 1: Environment Setup

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your credentials:**
   ```
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_ID
   PRIVATE_KEY=your_private_key_without_0x
   PINATA_API_KEY=your_pinata_api_key
   PINATA_SECRET_API_KEY=your_pinata_secret
   ENCRYPTION_KEY=any_32_character_random_string
   ```

   ⚠️ **Security Tips:**
   - Never commit `.env` to Git
   - Use a test wallet for development
   - Don't share your private key

---

## Step 2: Install Dependencies

```bash
# Install root dependencies (Hardhat, ethers, etc.)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## Step 3: Compile & Test Smart Contracts

```bash
# Compile contracts
npx hardhat compile

# Run tests (should see 21 passing)
npx hardhat test
```

✅ **Expected output:** All 21 tests passing

---

## Step 4: Deploy to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

This will:
- Deploy the HealthVault contract to Sepolia
- Save contract address to `frontend/src/utils/contractAddress.json`
- Save ABI to `frontend/src/utils/HealthVaultABI.json`

✅ **Check:** You should see a deployed contract address

---

## Step 5: Run Frontend

1. **Configure frontend environment:**
   ```bash
   cd frontend
   echo VITE_ENCRYPTION_KEY=your_32_character_random_string > .env
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open browser:**
   - Navigate to http://localhost:3000
   - You should see the Health Data Vault app

---

## Step 6: Connect Wallet

1. Click "Connect Wallet"
2. Approve connection in MetaMask
3. **Ensure you're on Sepolia testnet**
4. Select your role (Patient, Doctor, Diagnostics, or Researcher)

---

## Step 7: Test the System

### As a Patient:
1. Select "Patient" role
2. Upload a test file (any PDF/image)
3. View your records
4. Grant access to a doctor (use another wallet address)

### As a Doctor:
1. Switch to a different MetaMask account
2. Select "Doctor" role
3. Enter patient's wallet address
4. You should see "Not authorized" initially
5. Have patient grant you access
6. Now you can view and download records

### As Diagnostics:
1. Switch to another account
2. Select "Diagnostics" role
3. Enter patient wallet address
4. Upload a diagnostic report (requires patient permission)

---

## 🎉 Success!

You now have a fully functional decentralized health data vault!

---

## Common Issues

### "Contract not deployed"
- Run deployment script first
- Check that `frontend/src/utils/contractAddress.json` exists

### "Insufficient funds"
- Get Sepolia ETH from https://sepoliafaucet.com/

### "Wrong network"
- Switch MetaMask to Sepolia testnet
- Chain ID: 11155111

### "Transaction failed"
- Check you have enough Sepolia ETH for gas
- Verify wallet is connected
- Check console for error details

---

## Next Steps

- Read full documentation in README.md
- Deploy to mainnet (NOT recommended without audit)
- Implement backend API for file encryption
- Add more features (time-based access, emergency access, etc.)

---

## Need Help?

- Check the Troubleshooting section in README.md
- Review test files for usage examples
- Open an issue on GitHub
