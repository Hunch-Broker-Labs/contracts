import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Signature library first (if needed as separate contract)
  // Note: Signature.sol is a library file, not a contract
  
  // Deploy Bridge2
  const hotAddresses = process.env.HOT_ADDRESSES?.split(",") || [];
  const coldAddresses = process.env.COLD_ADDRESSES?.split(",") || [];
  const powers = process.env.POWERS?.split(",").map(p => parseInt(p)) || [];
  const usdcAddress = process.env.USDC_ADDRESS || "";
  const disputePeriodSeconds = parseInt(process.env.DISPUTE_PERIOD_SECONDS || "86400"); // 1 day default
  const blockDurationMillis = parseInt(process.env.BLOCK_DURATION_MILLIS || "250"); // 250ms default
  const lockerThreshold = parseInt(process.env.LOCKER_THRESHOLD || "3");

  if (hotAddresses.length === 0 || coldAddresses.length === 0 || powers.length === 0) {
    throw new Error("Please set HOT_ADDRESSES, COLD_ADDRESSES, and POWERS in .env");
  }

  if (!usdcAddress) {
    throw new Error("Please set USDC_ADDRESS in .env");
  }

  console.log("Deployment parameters:");
  console.log("Hot addresses:", hotAddresses);
  console.log("Cold addresses:", coldAddresses);
  console.log("Powers:", powers);
  console.log("USDC address:", usdcAddress);
  console.log("Dispute period (seconds):", disputePeriodSeconds);
  console.log("Block duration (millis):", blockDurationMillis);
  console.log("Locker threshold:", lockerThreshold);

  const Bridge2 = await ethers.getContractFactory("Bridge2");
  const bridge2 = await Bridge2.deploy(
    hotAddresses,
    coldAddresses,
    powers,
    usdcAddress,
    disputePeriodSeconds,
    blockDurationMillis,
    lockerThreshold
  );

  await bridge2.waitForDeployment();
  const address = await bridge2.getAddress();

  console.log("Bridge2 deployed to:", address);
  console.log("\nSave this address for your .env files:");
  console.log(`BRIDGE2_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

