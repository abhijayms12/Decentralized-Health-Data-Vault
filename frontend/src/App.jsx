import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedBackground from "./components/AnimatedBackground";
import LandingPage from "./components/LandingPage";
import PatientDashboard from "./components/PatientDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import DiagnosticsDashboard from "./components/DiagnosticsDashboard";

// Main App Component with Animated Background
function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [account, setAccount] = useState(null);
  const [contractAddress, setContractAddress] = useState(null);
  const [contractABI, setContractABI] = useState(null);
  const [contract, setContract] = useState(null);
  const [userRole, setUserRole] = useState(0); // 0: NONE, 1: PATIENT, 2: DOCTOR, 3: DIAGNOSTICS
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  const SEPOLIA_CHAIN_ID = "0xaa36a7";

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    loadContractData();
  }, []);

  useEffect(() => {
    if (contractAddress && contractABI) {
      checkIfWalletIsConnected().catch(err => {
        console.error("Wallet check failed:", err);
        setError("Failed to check wallet connection");
      });
    }
  }, [contractAddress, contractABI]);

  const loadContractData = async () => {
    try {
      const addressData = await import("./utils/contractAddress.json");
      const abiData = await import("./utils/HealthVaultABI.json");
      setContractAddress(addressData.address);
      setContractABI(abiData.default);
    } catch (error) {
      console.error("Contract loading failed:", error);
      setError("Contract not deployed. Please run: npx hardhat run scripts/deploy.js --network sepolia");
    }
  };

  const checkIfWalletIsConnected = async () => {
    try {
      if (!window.ethereum) {
        setError("Please install MetaMask to use this application");
        return;
      }

      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      
      if (accounts.length > 0) {
        await connectWallet();
      }
    } catch (error) {
      console.error("Error checking wallet connection:", error);
      setError("Failed to check wallet: " + error.message);
    }
  };

  const checkNetwork = async () => {
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      const currentChainId = chainId.toLowerCase();
      const expectedChainId = SEPOLIA_CHAIN_ID.toLowerCase();
      
      if (currentChainId !== expectedChainId) {
        setError(`Wrong network detected. Please switch to Sepolia testnet in MetaMask.`);
        return false;
      }
      
      console.log("✓ Connected to Sepolia testnet");
      return true;
    } catch (error) {
      console.error("Error checking network:", error);
      setError("Failed to check network: " + error.message);
      return false;
    }
  };

  const switchToSepolia = async () => {
    try {
      setLoading(true);
      setError("");
      
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
      
      await connectWallet();
    } catch (error) {
      console.error("Error switching network:", error);
      if (error.code === 4902) {
        setError("Sepolia network not found. Please add it manually in MetaMask.");
      } else {
        setError("Failed to switch network: " + error.message);
      }
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      setError("");

      if (!window.ethereum) {
        setError("Please install MetaMask");
        setLoading(false);
        return;
      }

      if (!contractAddress || !contractABI) {
        setError("Contract not loaded yet. Please refresh the page.");
        setLoading(false);
        return;
      }

      const isCorrectNetwork = await checkNetwork();
      if (!isCorrectNetwork) {
        setLoading(false);
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const walletAddress = accounts[0];
      setAccount(walletAddress);

      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);

      const signer = await web3Provider.getSigner();
      const contractInstance = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );
      setContract(contractInstance);

      // Don't auto-assign role - user must explicitly select and confirm via MetaMask
      setUserRole(0);

      setIsInitialized(true);
      setLoading(false);

      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAccount(null);
          setContract(null);
          setUserRole(0);
          setIsInitialized(false);
          setShowLanding(true);
        } else {
          // When switching accounts, always reset to role selection (no auto-assignment)
          setAccount(null);
          setContract(null);
          setUserRole(0);
          setIsInitialized(false);
          setShowLanding(true);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };

    } catch (error) {
      console.error("Error connecting wallet:", error);
      setError("Failed to connect wallet: " + error.message);
      setLoading(false);
      setIsInitialized(false);
    }
  };

  const assignRole = async (roleType) => {
    if (!contract) {
      console.error("Contract not initialized");
      setError("Contract not initialized. Please refresh and reconnect your wallet.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log(`Requesting role assignment: ${getRoleName(roleType)}`);
      
      // Always send transaction to blockchain - let user confirm in MetaMask
      const tx = await contract.assignRole(roleType);
      console.log("Transaction sent, waiting for confirmation...");
      
      await tx.wait();
      console.log("Transaction confirmed!");

      setUserRole(roleType);
      setError("");
      setLoading(false);

      console.log(`✓ Role assigned successfully: ${getRoleName(roleType)}`);
    } catch (error) {
      console.error("Error assigning role:", error);
      
      let errorMsg = "Failed to assign role: ";
      
      if (error.message.includes("user rejected")) {
        errorMsg = "Transaction cancelled by user";
      } else if (error.message.includes("Role already assigned")) {
        errorMsg = "You already have a role assigned. You cannot change roles.";
      } else {
        errorMsg += error.message;
      }
      
      setError(errorMsg);
      setLoading(false);
    }
  };

  const getRoleName = (role) => {
    switch (role) {
      case 0: return "None";
      case 1: return "Patient";
      case 2: return "Doctor";
      case 3: return "Diagnostics";
      default: return "Unknown";
    }
  };

  const switchRole = () => {
    setUserRole(0);
    setError("");
    setLoading(false);
  };

  const handleSelectRole = () => {
    setShowLanding(false);
  };

  // Landing Page
  if (showLanding && !account) {
    return (
      <>
        <AnimatedBackground />
        <AnimatePresence mode="wait">
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <LandingPage onSelectRole={handleSelectRole} />
          </motion.div>
        </AnimatePresence>
      </>
    );
  }

  // Wallet Connection Screen
  if (!account) {
    return (
      <>
        <AnimatedBackground />
        <AnimatePresence mode="wait">
          <motion.div
            key="connect"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 min-h-screen flex items-center justify-center p-6"
          >
            <motion.div 
              className="glass-card p-12 max-w-lg w-full"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
          >
            <div className="text-center mb-10">
              <motion.div
                className="w-20 h-20 bg-gradient-to-br from-[#14B8A6] to-[#06B6D4] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl"
                animate={{
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </motion.div>
              <h1 className="text-4xl font-black text-[#0F172A] mb-3">
                <span className="text-gradient">Connect Wallet</span>
              </h1>
              <p className="text-lg text-[#64748B]">
                Connect your MetaMask to continue
              </p>
            </div>
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-[#FEF2F2]/80 backdrop-blur-sm border-2 border-[#EF4444]/30 text-[#DC2626] rounded-2xl text-sm"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              onClick={connectWallet}
              disabled={loading}
              className="btn-primary w-full mb-4"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Connecting...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Connect Wallet
                </span>
              )}
            </motion.button>

            {error && error.includes("Wrong network") && (
              <motion.button
                onClick={switchToSepolia}
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:shadow-2xl transition-all duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? "Switching..." : "Switch to Sepolia Network"}
              </motion.button>
            )}

            <motion.button
              onClick={() => setShowLanding(true)}
              className="btn-ghost w-full mt-4"
              whileHover={{ scale: 1.02 }}
            >
              ← Back to Home
            </motion.button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
      </>
    );
  }

  // Role Selection Screen
  if (userRole === 0) {
    return (
      <>
        <AnimatedBackground />
        <AnimatePresence mode="wait">
          <motion.div
            key="role-selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 min-h-screen py-12 px-6"
        >
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center mb-16"
            >
              <h1 className="text-5xl md:text-6xl font-black text-[#0F172A] mb-4">
                Choose Your <span className="gradient-text-animated">Role</span>
              </h1>
              <p className="text-xl text-[#64748B] max-w-2xl mx-auto">
                Select how you'll use HealthVault
              </p>
            </motion.div>

            <motion.div
              className="floating-panel p-6 mb-10 flex items-center justify-between"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#10B981] to-[#14B8A6] rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-[#64748B]">Connected Wallet</p>
                  <code className="text-lg font-semibold text-[#0F172A]">
                    {account.substring(0, 8)}...{account.substring(36)}
                  </code>
                </div>
              </div>
              <span className="badge-modern">Connected</span>
            </motion.div>

            {error && (
              <AnimatePresence mode="wait">
                <motion.div
                  key="error-message"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="mb-8 p-4 bg-[#FEF2F2]/80 backdrop-blur-sm border-2 border-[#EF4444]/30 text-[#DC2626] rounded-2xl"
                >
                  {error}
                </motion.div>
              </AnimatePresence>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
              {[
                {
                  role: 1,
                  name: "Patient",
                  description: "Upload, manage, and control access to your health records",
                  icon: (
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  ),
                  color: "from-[#2563EB] to-[#3B82F6]",
                },
                {
                  role: 2,
                  name: "Doctor",
                  description: "Access patient records and upload prescriptions with authorization",
                  icon: (
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  ),
                  color: "from-[#14B8A6] to-[#06B6D4]",
                },
                {
                  role: 3,
                  name: "Diagnostics",
                  description: "Upload lab reports and test results directly to patient vaults",
                  icon: (
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  ),
                  color: "from-[#8B5CF6] to-[#A78BFA]",
                },
              ].map((item, index) => (
                <motion.button
                  key={item.role}
                  onClick={() => assignRole(item.role)}
                  disabled={loading || !isInitialized}
                  className="glass-card p-8 text-center group hover-glow disabled:opacity-50 ripple-container"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 * index + 0.3 }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className={`w-20 h-20 bg-gradient-to-br ${item.color} rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl`}
                    whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    {item.icon}
                  </motion.div>
                  <h3 className="text-2xl font-bold text-[#0F172A] mb-3">{item.name}</h3>
                  <p className="text-[#64748B] leading-relaxed">{item.description}</p>
                </motion.button>
              ))}
            </div>

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center"
              >
                <div className="inline-flex items-center gap-3 glass-card px-8 py-4">
                  <div className="w-5 h-5 border-2 border-[#14B8A6] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[#64748B] font-medium">Processing... Please confirm in MetaMask</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      </>
    );
  }

  // Dashboard View
  return (
    <>
      <AnimatedBackground />
      <AnimatePresence mode="wait">
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 min-h-screen"
        >
          {/* Header */}
          <motion.header
            className="backdrop-blur-xl border-b border-white/30 sticky top-0 z-50"
            style={{
              background: 'rgba(255, 255, 255, 0.25)',
              boxShadow: '0 8px 32px rgba(31, 38, 135, 0.07), 0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100 }}
          >
            <div className="container mx-auto px-6 py-5 flex items-center">
              {/* Left: Wallet Address */}
              <div className="flex-1 flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
                  <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></div>
                  <code className="text-sm text-[#64748B] font-medium">{account.substring(0, 6)}...{account.substring(38)}</code>
                </div>
              </div>

              {/* Center: Logo and Title */}
              <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
                <motion.div
                  className="w-12 h-12 bg-gradient-to-br from-[#14B8A6] to-[#06B6D4] rounded-2xl flex items-center justify-center shadow-xl"
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </motion.div>
                <div>
                  <h1 className="text-xl font-bold text-[#0F172A]">HealthVault</h1>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                    userRole === 1 ? 'bg-[#EFF6FF] text-[#2563EB]' :
                    userRole === 2 ? 'bg-[#F0FDFA] text-[#0D9488]' :
                    'bg-[#F5F3FF] text-[#8B5CF6]'
                  }`}>
                    <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
                    {getRoleName(userRole)}
                  </span>
                </div>
              </div>

              {/* Right: Switch Role Button */}
              <div className="flex-1 flex justify-end">
                <motion.button
                  onClick={switchRole}
                  className="btn-ghost"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Switch Role
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-10">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-5 bg-[#FEF2F2]/80 backdrop-blur-sm border-2 border-[#EF4444]/30 text-[#DC2626] rounded-2xl"
            >
              {error}
            </motion.div>
          )}

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {userRole === 1 && <PatientDashboard contract={contract} account={account} />}
            {userRole === 2 && <DoctorDashboard contract={contract} account={account} />}
            {userRole === 3 && <DiagnosticsDashboard contract={contract} account={account} />}
          </motion.div>
        </main>
      </motion.div>
    </AnimatePresence>
    </>
  );
}

export default App;
