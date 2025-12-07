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

  useEffect(() => {
    loadContractData();
    checkIfWalletIsConnected();
  }, []);

  const loadContractData = async () => {
    try {
      const addressData = await import("./utils/contractAddress.json");
      const abiData = await import("./utils/HealthVaultABI.json");
      setContractAddress(addressData.address);
      setContractABI(abiData.default);
    } catch (error) {
      console.warn("Contract not deployed yet. Please deploy first.");
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

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const account = accounts[0];
      setAccount(account);

      // Create provider and signer using ethers v6
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      if (!contractAddress || !contractABI) {
        setError("Contract not deployed. Please run deployment script first.");
        setLoading(false);
        return;
      }

      // Get signer
      const signer = await browserProvider.getSigner();

      // Create contract instance
      const healthVaultContract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );

      setContract(healthVaultContract);

      // Get user role
      const role = await healthVaultContract.roles(account);
      setUserRole(Number(role));

      setLoading(false);

      // Listen for account changes
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          // User disconnected wallet
          setAccount(null);
          setContract(null);
          setUserRole(0);
        } else {
          // User switched accounts
          window.location.reload();
        }
      });

      // Listen for chain changes
      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });

    } catch (error) {
      console.error("Error connecting wallet:", error);
      setError("Failed to connect wallet: " + error.message);
      setLoading(false);
    }
  };

  const assignRole = async (roleType) => {
    try {
      setLoading(true);
      setError("");

      const tx = await contract.assignRole(account, roleType);
      await tx.wait();

      // Refresh role
      const role = await contract.roles(account);
      setUserRole(Number(role));

      setLoading(false);
    } catch (error) {
      console.error("Error assigning role:", error);
      setError("Failed to assign role: " + error.message);
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
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => assignRole(1)}
                disabled={loading}
                className="p-6 bg-blue-100 hover:bg-blue-200 rounded-lg border-2 border-blue-300 transition disabled:opacity-50"
              >
                <div className="text-4xl mb-2">🏥</div>
                <div className="font-semibold text-lg">Patient</div>
                <div className="text-sm text-gray-600 mt-2">
                  Upload and manage your health records
                </div>
              </button>

              <button
                onClick={() => assignRole(2)}
                disabled={loading}
                className="p-6 bg-green-100 hover:bg-green-200 rounded-lg border-2 border-green-300 transition disabled:opacity-50"
              >
                <div className="text-4xl mb-2">👨‍⚕️</div>
                <div className="font-semibold text-lg">Doctor</div>
                <div className="text-sm text-gray-600 mt-2">
                  Access patient records with permission
                </div>
              </button>

              <button
                onClick={() => assignRole(3)}
                disabled={loading}
                className="p-6 bg-purple-100 hover:bg-purple-200 rounded-lg border-2 border-purple-300 transition disabled:opacity-50"
              >
                <div className="text-4xl mb-2">🔬</div>
                <div className="font-semibold text-lg">Diagnostics</div>
                <div className="text-sm text-gray-600 mt-2">
                  Upload diagnostic reports for patients
                </div>
              </button>

              <button
                onClick={() => assignRole(4)}
                disabled={loading}
                className="p-6 bg-yellow-100 hover:bg-yellow-200 rounded-lg border-2 border-yellow-300 transition disabled:opacity-50"
              >
                <div className="text-4xl mb-2">📊</div>
                <div className="font-semibold text-lg">Researcher</div>
                <div className="text-sm text-gray-600 mt-2">
                  Access anonymized metadata only
                </div>
              </button>
            </div>
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
