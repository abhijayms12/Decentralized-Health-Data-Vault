const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // SAFETY CHECK: Prevent accidental mainnet deployment
  const networkName = network.name;
  const ALLOWED_NETWORKS = ["sepolia", "localhost", "hardhat"];
  
  if (!ALLOWED_NETWORKS.includes(networkName)) {
    console.error(`❌ ERROR: Deployment to '${networkName}' is not allowed!`);
    console.error(`✅ Allowed networks: ${ALLOWED_NETWORKS.join(", ")}`);
    console.error(`💡 This safety check prevents accidental mainnet deployment.`);
    process.exit(1);
  }
  
  console.log(`✅ Deploying to allowed network: ${networkName}`);
  console.log("Deploying HealthVault contract...");

  // Get the contract factory
  const HealthVault = await ethers.getContractFactory("HealthVault");
  
  // Deploy the contract
  const healthVault = await HealthVault.deploy();
  
  // Wait for deployment to complete
  await healthVault.waitForDeployment();
  
  const contractAddress = await healthVault.getAddress();
  console.log(`HealthVault deployed to: ${contractAddress}`);

  // TODO: After deploying the HealthVault contract, write code to
  // automatically save the deployed address inside
  // frontend/src/utils/contractAddress.json.
  
  // Create the utils directory if it doesn't exist
  const utilsDir = path.join(__dirname, "..", "frontend", "src", "utils");
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }

  // Save contract address to JSON file
  const contractData = {
    address: contractAddress,
    deployedAt: new Date().toISOString(),
    network: network.name
  };

  const outputPath = path.join(utilsDir, "contractAddress.json");
  fs.writeFileSync(outputPath, JSON.stringify(contractData, null, 2));
  
  console.log(`Contract address saved to: ${outputPath}`);

  // Also save the ABI for frontend use
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "HealthVault.sol", "HealthVault.json");
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiPath = path.join(utilsDir, "HealthVaultABI.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`Contract ABI saved to: ${abiPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
