import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploys ERC20 token, Bridge2 contract, and TxKeeper contract to local Hardhat node
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-all-local.ts --network localhost
 * 
 * Environment variables (optional, will use defaults if not set):
 *   PRIVATE_KEY - Private key of deployer (defaults to first Hardhat account)
 *   ADMIN_ADDRESS - Admin address for TxKeeper (defaults to deployer address)
 *   HOT_ADDRESSES - Comma-separated validator hot addresses
 *   COLD_ADDRESSES - Comma-separated validator cold addresses
 *   POWERS - Comma-separated validator powers
 *   DISPUTE_PERIOD_SECONDS - Dispute period in seconds (default: 86400)
 *   BLOCK_DURATION_MILLIS - Block duration in milliseconds (default: 250)
 *   LOCKER_THRESHOLD - Locker threshold (default: 3)
 *   TOKEN_NAME - ERC20 token name (default: "Test USDC")
 *   TOKEN_SYMBOL - ERC20 token symbol (default: "TUSDC")
 *   TOKEN_DECIMALS - ERC20 token decimals (default: 6)
 *   INITIAL_SUPPLY - Initial token supply (default: 1,000,000 tokens)
 */

async function main() {
  console.log("=".repeat(80));
  console.log("Deploying ERC20, Bridge2, and TxKeeper to Local Hardhat Node");
  console.log("=".repeat(80));
  console.log("");

  // Get signer
  let deployer;
  if (process.env.PRIVATE_KEY) {
    deployer = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
    console.log("Using provided private key");
  } else {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    console.log("Using first Hardhat account");
  }

  console.log("Deployer address:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  // ============================================
  // Step 1: Deploy ERC20 Token
  // ============================================
  console.log("Step 1: Deploying ERC20 Token (TestUSDC)...");
  console.log("-".repeat(80));

  // Get deployment parameters from environment or use defaults
  const tokenName = process.env.TOKEN_NAME || "Test USDC";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "TUSDC";
  const tokenDecimals = parseInt(process.env.TOKEN_DECIMALS || "6");
  const initialSupply = process.env.INITIAL_SUPPLY 
    ? BigInt(process.env.INITIAL_SUPPLY) 
    : BigInt(1000000) * BigInt(10 ** tokenDecimals); // Default: 1,000,000 tokens

  console.log("ERC20 deployment parameters:");
  console.log("  Name:", tokenName);
  console.log("  Symbol:", tokenSymbol);
  console.log("  Decimals:", tokenDecimals);
  console.log("  Initial Supply:", initialSupply.toString());
  console.log("");

  const TestERC20 = await ethers.getContractFactory("TestERC20", deployer);
  const testERC20 = await TestERC20.deploy(
    tokenName,
    tokenSymbol,
    tokenDecimals,
    initialSupply
  );
  await testERC20.waitForDeployment();
  const erc20Address = await testERC20.getAddress();

  console.log("✅ TestERC20 deployed to:", erc20Address);
  console.log("");

  // ============================================
  // Step 2: Deploy Bridge2
  // ============================================
  console.log("Step 2: Deploying Bridge2 Contract...");
  console.log("-".repeat(80));

  // Get validator configuration
  // Default to first 3 Hardhat accounts if not provided
  let hotAddresses: string[];
  let coldAddresses: string[];
  let powers: number[];

  if (process.env.HOT_ADDRESSES && process.env.COLD_ADDRESSES && process.env.POWERS) {
    hotAddresses = process.env.HOT_ADDRESSES.split(",").map(addr => addr.trim());
    coldAddresses = process.env.COLD_ADDRESSES.split(",").map(addr => addr.trim());
    powers = process.env.POWERS.split(",").map(p => parseInt(p.trim()));
  } else {
    // Use first 3 Hardhat accounts as validators
    const signers = await ethers.getSigners();
    hotAddresses = [
      signers[0].address,
      signers[1].address,
      signers[2].address,
    ];
    coldAddresses = [
      signers[0].address,
      signers[1].address,
      signers[2].address,
    ];
    powers = [100, 100, 100];
    console.log("⚠️  Using default validator set (first 3 Hardhat accounts)");
    console.log("   Set HOT_ADDRESSES, COLD_ADDRESSES, and POWERS to customize");
  }

  const disputePeriodSeconds = parseInt(process.env.DISPUTE_PERIOD_SECONDS || "86400");
  const blockDurationMillis = parseInt(process.env.BLOCK_DURATION_MILLIS || "250");
  const lockerThreshold = parseInt(process.env.LOCKER_THRESHOLD || "3");

  console.log("Bridge2 deployment parameters:");
  console.log("  Hot addresses:", hotAddresses);
  console.log("  Cold addresses:", coldAddresses);
  console.log("  Powers:", powers);
  console.log("  USDC address:", erc20Address);
  console.log("  Dispute period (seconds):", disputePeriodSeconds);
  console.log("  Block duration (millis):", blockDurationMillis);
  console.log("  Locker threshold:", lockerThreshold);
  console.log("");

  const Bridge2 = await ethers.getContractFactory("Bridge2");
  const bridge2 = await Bridge2.deploy(
    hotAddresses,
    coldAddresses,
    powers,
    erc20Address,
    disputePeriodSeconds,
    blockDurationMillis,
    lockerThreshold
  );

  await bridge2.waitForDeployment();
  const bridge2Address = await bridge2.getAddress();

  console.log("✅ Bridge2 deployed to:", bridge2Address);
  console.log("");

  // ============================================
  // Step 3: Deploy TxKeeper
  // ============================================
  console.log("Step 3: Deploying TxKeeper Contract...");
  console.log("-".repeat(80));

  // Get admin address (defaults to deployer)
  let adminAddress: string;
  if (process.env.ADMIN_ADDRESS) {
    adminAddress = process.env.ADMIN_ADDRESS;
    console.log("Using provided admin address");
  } else {
    adminAddress = deployer.address;
    console.log("Using deployer as admin address");
  }

  console.log("Admin address:", adminAddress);
  console.log("");

  const TxKeeper = await ethers.getContractFactory("TxKeeper", deployer);
  const txKeeper = await TxKeeper.deploy(adminAddress);
  await txKeeper.waitForDeployment();
  const txKeeperAddress = await txKeeper.getAddress();

  console.log("✅ TxKeeper deployed to:", txKeeperAddress);
  console.log("");

  // ============================================
  // Step 4: Summary
  // ============================================
  console.log("=".repeat(80));
  console.log("Deployment Summary");
  console.log("=".repeat(80));
  console.log("");
  console.log("TestERC20 Address:", erc20Address);
  console.log("Bridge2 Address:", bridge2Address);
  console.log("TxKeeper Address:", txKeeperAddress);
  console.log("TxKeeper Admin:", adminAddress);
  console.log("");
  console.log("Validator Set:");
  for (let i = 0; i < hotAddresses.length; i++) {
    console.log(`  Validator ${i}:`);
    console.log(`    Hot:   ${hotAddresses[i]}`);
    console.log(`    Cold:  ${coldAddresses[i]}`);
    console.log(`    Power: ${powers[i]}`);
  }
  console.log("");
  console.log("=".repeat(80));
  console.log("Environment Variables for Testing:");
  console.log("=".repeat(80));
  console.log("");
  console.log("# Add these to your .env file or export them:");
  console.log(`export BRIDGE2_ADDRESS="${bridge2Address}"`);
  console.log(`export USDC_ADDRESS="${erc20Address}"`);
  console.log(`export TX_KEEPER_ADDRESS="${txKeeperAddress}"`);
  console.log(`export ADMIN_ADDRESS="${adminAddress}"`);
  console.log(`export VALIDATOR_ADDRESSES="${hotAddresses.join(",")}"`);
  console.log(`export VALIDATOR_POWERS="${powers.join(",")}"`);
  console.log(`export VALIDATOR_SET_EPOCH="0"`);
  console.log("");
  console.log("# For withdrawal script, you'll also need:");
  console.log(`export PRIVATE_KEY="<your_private_key>"`);
  console.log(`export USER_ADDRESS="<user_address>"`);
  console.log(`export VALIDATOR_PRIVATE_KEYS="<validator1_key>,<validator2_key>,<validator3_key>"`);
  console.log("");
  console.log("# For server and services:");
  console.log(`export TX_KEEPER_ADDRESS="${txKeeperAddress}"`);
  console.log(`export ADMIN_PRIVATE_KEY="<admin_private_key>"`);
  console.log("");
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

