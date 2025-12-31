import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Get admin address from env or derive from private key
  let adminAddress: string;
  if (process.env.ADMIN_ADDRESS) {
    adminAddress = process.env.ADMIN_ADDRESS;
  } else if (process.env.PRIVATE_KEY) {
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    adminAddress = wallet.address;
  } else {
    throw new Error("Please set ADMIN_ADDRESS or PRIVATE_KEY in .env");
  }

  console.log("Deploying TxKeeper contract...");
  console.log("Admin address:", adminAddress);

  // Create signer from private key if available, otherwise use Hardhat's default signer
  let signer;
  if (process.env.PRIVATE_KEY) {
    // Use Hardhat's provider (already configured for the network)
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
    console.log("Deploying with account:", signer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(signer.address)).toString());
  } else {
    const [deployer] = await ethers.getSigners();
    signer = deployer;
    console.log("Deploying with account:", signer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(signer.address)).toString());
  }

  const TxKeeper = await ethers.getContractFactory("TxKeeper");
  const txKeeper = await TxKeeper.connect(signer).deploy(adminAddress);

  await txKeeper.waitForDeployment();
  const address = await txKeeper.getAddress();

  console.log("\nTxKeeper deployed to:", address);
  console.log("Admin address:", adminAddress);
  console.log("\nSave this address for your .env files:");
  console.log(`TX_KEEPER_ADDRESS=${address}`);
  console.log(`ADMIN_ADDRESS=${adminAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

