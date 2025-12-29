# Setup Instructions for Doctor (Testing Partner)

## Quick Start - 3 Steps

### Step 1: Get the Shared Encryption Key
Your friend (the project owner) will share a 64-character hex string with you. It looks like this:
```
88322f765d6c102c67ff57909dd5f6f109e506988dd948b5eb6823ffeb5a9982
```

### Step 2: Add the Key to Your `.env` File

1. Navigate to: `frontend/.env`
2. Find or add this line:
```env
VITE_ENCRYPTION_KEY=YOUR_KEY_HERE
```
3. Replace `YOUR_KEY_HERE` with the encryption key your friend shared
4. Save the file

Example of what your `frontend/.env` should contain:
```env
# Lighthouse API key for IPFS uploads (optional for viewing)
VITE_LIGHTHOUSE_API_KEY=your_lighthouse_key_here

# Shared encryption key (REQUIRED to decrypt patient files)
VITE_ENCRYPTION_KEY=88322f765d6c102c67ff57909dd5f6f109e506988dd948b5eb6823ffeb5a9982
```

### Step 3: Restart the Development Server

If the dev server is already running:
1. Press `Ctrl+C` to stop it
2. Run: `npm run dev`
3. The app will now load with the encryption key

---

## Testing the Doctor Portal

### 1. Connect Your Wallet
- Open the app in your browser
- Click "Connect Wallet"
- Select your MetaMask account

### 2. Select Doctor Role
- Click the "Doctor" card
- Approve the transaction to assign yourself the Doctor role

### 3. Get Patient Address
- Ask your friend (the patient) for their wallet address
- Example: `0xcba552f14d55c17a40f9d000a280d2d076e3e57c`

### 4. Request Access
- The **patient** must grant you access first!
- Patient goes to their dashboard → "Grant Doctor Access" section
- Patient enters your wallet address and clicks "Grant Access"
- Patient approves the transaction

### 5. View Patient Records
- Go to the Doctor Dashboard
- Enter the patient's wallet address
- Click "Fetch Records"
- You'll see a list of their uploaded files

### 6. View or Download Files
- Click "View" to open the file in a new tab
- Click "Download" to save the file to your computer
- Files will be automatically decrypted using the shared key

---

## Troubleshooting

### ❌ "Encryption key not configured"
**Problem:** The VITE_ENCRYPTION_KEY is not in your `.env` file  
**Solution:** 
1. Make sure you added the key to `frontend/.env` (not the root `.env`)
2. Restart the dev server after adding the key

### ❌ "Failed to decrypt file"
**Problem:** Wrong encryption key  
**Solution:**
1. Double-check you copied the EXACT key from your friend
2. Make sure there are no spaces or line breaks
3. Restart the dev server

### ❌ "Not authorized to view records"
**Problem:** Patient hasn't granted you access  
**Solution:**
1. Ask the patient to go to "Grant Doctor Access"
2. Patient must enter YOUR wallet address
3. Patient must approve the blockchain transaction
4. Try fetching records again

### ❌ File download is slow
**Problem:** IPFS can take 30+ seconds to retrieve files  
**Solution:**
- This is normal for IPFS
- Wait patiently, especially on first download
- Subsequent downloads may be faster

---

## Security Note

⚠️ **The shared encryption key should be kept private!**

- Only share it with authorized users (doctors, diagnostics labs)
- Do NOT commit it to GitHub
- Do NOT share it publicly
- In production, use a more sophisticated key management system

---

## Summary

✅ Add `VITE_ENCRYPTION_KEY=<shared-key>` to `frontend/.env`  
✅ Restart dev server  
✅ Patient grants you access via smart contract  
✅ You can now view and download encrypted patient files  

**That's it! You're ready to test the doctor portal.**
