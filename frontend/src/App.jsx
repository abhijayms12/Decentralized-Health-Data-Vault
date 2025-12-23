import { useState, useEffect } from "react";
import { ethers } from "ethers";
import PatientDashboard from "./components/PatientDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import DiagnosticsDashboard from "./components/DiagnosticsDashboard";

function App() {
  const [account, setAccount] = useState(null);
  const [contractAddress, setContractAddress] = useState(null);
  const [contractABI, setContractABI] = useState(null);
  const [contract, setContract] = useState(null);
  const [userRole, setUserRole] = useState(0); // 0: NONE, 1: PATIENT, 2: DOCTOR, 3: DIAGNOSTICS, 4: RESEARCHER
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  // Sepolia Chain ID
  const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in decimal

  useEffect(() => {
    loadContractData();
  }, []);

  // FIXED: Wrapped async call and added missing dependency
  useEffect(() => {
    if (contractAddress && contractABI) {
      checkIfWalletIsConnected().catch(err => {
        console.error("Wallet check failed:", err);
        setError("Failed to check wallet connection");
      });
    }
  }, [contractAddress, contractABI]); // checkIfWalletIsConnected is stable

  const loadContractData = async () => {
    try {
      console.log("Loading contract data...");
      const addressData = await import("./utils/contractAddress.json");
      const abiData = await import("./utils/HealthVaultABI.json");
      console.log("Contract address loaded:", addressData.address);
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
      console.log("Current network chain ID:", chainId);
      console.log("Expected Sepolia chain ID:", SEPOLIA_CHAIN_ID);
      
      // Convert both to lowercase for case-insensitive comparison
      const currentChainId = chainId.toLowerCase();
      const expectedChainId = SEPOLIA_CHAIN_ID.toLowerCase();
      
      // Also check decimal format (11155111)
      const currentChainIdDecimal = parseInt(chainId, 16);
      console.log("Chain ID in decimal:", currentChainIdDecimal);
      
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
      
      console.log("✓ Switched to Sepolia");
      setLoading(false);
      
      // After switching, try connecting
      await connectWallet();
    } catch (error) {
      setLoading(false);
      
      // This error code indicates that the chain has not been added to MetaMask
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID,
                chainName: "Sepolia Test Network",
                nativeCurrency: {
                  name: "SepoliaETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["https://sepolia.infura.io/v3/"],
                blockExplorerUrls: ["https://sepolia.etherscan.io/"],
              },
            ],
          });
          
          // After adding, try connecting
          await connectWallet();
        } catch (addError) {
          console.error("Error adding Sepolia network:", addError);
          setError("Failed to add Sepolia network: " + addError.message);
        }
      } else if (error.code === 4001) {
        setError("Network switch rejected. Please switch to Sepolia manually in MetaMask.");
      } else {
        console.error("Error switching network:", error);
        setError("Failed to switch network: " + error.message);
      }
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setError("Please install MetaMask");
        return;
      }

      setLoading(true);
      setError("");
      setIsInitialized(false);

      // Check if we're on the correct network
      const isCorrectNetwork = await checkNetwork();
      if (!isCorrectNetwork) {
        setLoading(false);
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const account = accounts[0];
      console.log("Connected account:", account);
      setAccount(account);

      // Ensure contract data is loaded
      if (!contractAddress || !contractABI) {
        setError("Contract not deployed. Please run deployment script first.");
        setLoading(false);
        return;
      }

      // Create provider and signer using ethers v6
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      // Get signer
      const signer = await browserProvider.getSigner();
      console.log("Signer address:", await signer.getAddress());

      // Create contract instance
      const healthVaultContract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );

      console.log("Contract instance created at:", contractAddress);
      setContract(healthVaultContract);

      // Get user role from contract
      try {
        const role = await healthVaultContract.roles(account);
        console.log("User role:", Number(role));
        setUserRole(Number(role));
      } catch (roleError) {
        console.error("Error fetching role:", roleError);
        setUserRole(0); // Default to no role
      }

      setIsInitialized(true);
      setLoading(false);

      // FIXED: Event listeners with cleanup to prevent memory leaks
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          // User disconnected wallet
          setAccount(null);
          setContract(null);
          setUserRole(0);
          setIsInitialized(false);
        } else {
          // User switched accounts
          window.location.reload();
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      // Cleanup function to remove event listeners
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
    // Critical null guards
    if (!contract) {
      console.error("Contract not initialized");
      setError("Contract not initialized. Please refresh and reconnect your wallet.");
      return;
    }

    if (!account) {
      console.error("No account connected");
      setError("No wallet connected. Please connect your wallet first.");
      return;
    }

    if (!isInitialized) {
      console.error("System not initialized");
      setError("System still initializing. Please wait a moment.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log(`Assigning role ${roleType} to ${account}`);
      
      // Call the contract function with proper parameters
      const tx = await contract.assignRole(account, roleType);
      console.log("Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("Transaction confirmed");

      // Refresh role from contract
      const role = await contract.roles(account);
      const roleNumber = Number(role);
      console.log("Role updated to:", roleNumber);
      setUserRole(roleNumber);

      setLoading(false);
    } catch (error) {
      console.error("Error assigning role:", error);
      let errorMessage = "Failed to assign role: ";
      
      if (error.code === "ACTION_REJECTED") {
        errorMessage += "Transaction was rejected by user";
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += "Unknown error occurred";
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  const getRoleName = (role) => {
    switch (role) {
      case 0: return "None";
      case 1: return "Patient";
      case 2: return "Doctor";
      case 3: return "Diagnostics";
      case 4: return "Researcher";
      default: return "Unknown";
    }
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
            Health Data Vault
          </h1>
          <p className="text-center text-gray-600 mb-6">
            Decentralized Health Records on Blockchain
          </p>
          
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={connectWallet}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition mb-3"
          >
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>

          {error && error.includes("Wrong network") && (
            <button
              onClick={switchToSepolia}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-3 px-6 rounded-lg hover:bg-orange-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Switching..." : "Switch to Sepolia Network"}
            </button>
          )}

          <div className="mt-6 text-sm text-gray-500 text-center">
            <p>Make sure you have MetaMask installed</p>
            <p>and connected to Sepolia testnet</p>
          </div>
        </div>
      </div>
    );
  }

  if (userRole === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white shadow-xl rounded-lg p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Select Your Role</h1>
            <p className="text-gray-600 mb-6">
              Connected: <code className="bg-gray-100 px-2 py-1 rounded">{account}</code>
            </p>

            {error && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {!isInitialized && (
              <div className="mb-4 p-4 bg-yellow-100 text-yellow-700 rounded-lg">
                Initializing contract... Please wait.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => assignRole(1)}
                disabled={loading || !isInitialized || !contract}
                className="p-6 bg-blue-100 hover:bg-blue-200 rounded-lg border-2 border-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-4xl mb-2">🏥</div>
                <div className="font-semibold text-lg">Patient</div>
                <div className="text-sm text-gray-600 mt-2">
                  Upload and manage your health records
                </div>
              </button>

              <button
                onClick={() => assignRole(2)}
                disabled={loading || !isInitialized || !contract}
                className="p-6 bg-green-100 hover:bg-green-200 rounded-lg border-2 border-green-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-4xl mb-2">👨‍⚕️</div>
                <div className="font-semibold text-lg">Doctor</div>
                <div className="text-sm text-gray-600 mt-2">
                  Access patient records with permission
                </div>
              </button>

              <button
                onClick={() => assignRole(3)}
                disabled={loading || !isInitialized || !contract}
                className="p-6 bg-purple-100 hover:bg-purple-200 rounded-lg border-2 border-purple-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-4xl mb-2">🔬</div>
                <div className="font-semibold text-lg">Diagnostics</div>
                <div className="text-sm text-gray-600 mt-2">
                  Upload diagnostic reports for patients
                </div>
              </button>

              <button
                onClick={() => assignRole(4)}
                disabled={loading || !isInitialized || !contract}
                className="p-6 bg-yellow-100 hover:bg-yellow-200 rounded-lg border-2 border-yellow-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-4xl mb-2">📊</div>
                <div className="font-semibold text-lg">Researcher</div>
                <div className="text-sm text-gray-600 mt-2">
                  Access anonymized metadata only
                </div>
              </button>
            </div>

            {loading && (
              <div className="mt-4 text-center text-gray-600">
                Processing... Please confirm the transaction in MetaMask.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">
            Health Data Vault - {getRoleName(userRole)}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              {account.substring(0, 6)}...{account.substring(38)}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
            >
              Switch Role
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {userRole === 1 && <PatientDashboard contract={contract} account={account} />}
        {userRole === 2 && <DoctorDashboard contract={contract} account={account} />}
        {userRole === 3 && <DiagnosticsDashboard contract={contract} account={account} />}
        {userRole === 4 && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Researcher Dashboard</h2>
            <p className="text-gray-600">Coming soon - Anonymized metadata access</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
