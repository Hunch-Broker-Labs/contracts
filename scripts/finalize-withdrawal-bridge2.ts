import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Load the full Bridge2 ABI from the compiled artifact
const bridge2ArtifactPath = path.join(__dirname, "../artifacts/src/Bridge2.sol/Bridge2.json");
const bridge2Artifact = JSON.parse(fs.readFileSync(bridge2ArtifactPath, "utf-8"));
const BRIDGE2_ABI = bridge2Artifact.abi;

// Load TxKeeper ABI
const txKeeperArtifactPath = path.join(__dirname, "../artifacts/src/TxKeeper.sol/TxKeeper.json");
const txKeeperArtifact = JSON.parse(fs.readFileSync(txKeeperArtifactPath, "utf-8"));
const TX_KEEPER_ABI = txKeeperArtifact.abi;

async function main() {
  console.log("=".repeat(80));
  console.log("Bridge2 Withdrawal Finalization Script");
  console.log("=".repeat(80));
  console.log("");

  // Get configuration from environment
  const bridgeAddress = process.env.BRIDGE2_ADDRESS;
  const txKeeperAddress = process.env.TX_KEEPER_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;
  const messageHash = process.env.MESSAGE_HASH; // The withdrawal message hash from request step
  const user = process.env.USER_ADDRESS;
  const destination = process.env.DESTINATION_ADDRESS || user;
  const usd = process.env.USD_AMOUNT ? parseInt(process.env.USD_AMOUNT) : undefined;
  const nonce = process.env.NONCE ? parseInt(process.env.NONCE) : undefined;
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY || privateKey;

  if (!bridgeAddress) {
    throw new Error("BRIDGE2_ADDRESS environment variable is required");
  }
  if (!txKeeperAddress) {
    throw new Error("TX_KEEPER_ADDRESS environment variable is required");
  }
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  if (!messageHash) {
    throw new Error("MESSAGE_HASH environment variable is required (from withdrawal request step)");
  }

  console.log("Configuration:");
  console.log(`  Bridge2 Address: ${bridgeAddress}`);
  console.log(`  TxKeeper Address: ${txKeeperAddress}`);
  console.log(`  Message Hash: ${messageHash}`);
  if (user) console.log(`  User: ${user}`);
  if (destination) console.log(`  Destination: ${destination}`);
  if (usd) console.log(`  Amount: ${usd} (raw units) = ${usd / 1e6} USDC`);
  if (nonce) console.log(`  Nonce: ${nonce}`);
  console.log("");

  // Setup provider and signer
  const signer = new ethers.Wallet(privateKey, ethers.provider);
  const adminSigner = new ethers.Wallet(adminPrivateKey, ethers.provider);

  const bridge2Contract = new ethers.Contract(bridgeAddress, BRIDGE2_ABI, signer);
  const txKeeperContract = new ethers.Contract(txKeeperAddress, TX_KEEPER_ABI, adminSigner);

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`  Chain ID: ${chainId}`);
  console.log(`  Transaction signer address: ${signer.address}`);
  console.log(`  Admin signer address: ${adminSigner.address}`);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`  Transaction signer balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // Step 1: Check withdrawal status on Bridge2
  console.log("=".repeat(80));
  console.log("Step 1: Checking withdrawal status on Bridge2");
  console.log("=".repeat(80));
  
  try {
    const requestedWithdrawal = await bridge2Contract.requestedWithdrawals(messageHash);
    console.log(`  Requested withdrawal:`);
    console.log(`    Requested time: ${requestedWithdrawal.requestedTime}`);
    
    if (requestedWithdrawal.requestedTime === 0n) {
      throw new Error(`Withdrawal with message hash ${messageHash} was not requested. Please request it first.`);
    }

    // Check if already finalized
    try {
      const isFinalized = await bridge2Contract.finalizedWithdrawals(messageHash);
      if (isFinalized) {
        console.log(`  ⚠️  Withdrawal is already finalized on Bridge2`);
      } else {
        console.log(`  ✅ Withdrawal is requested but not yet finalized`);
      }
    } catch (e) {
      // finalizedWithdrawals might not be public, that's okay
      console.log(`  ✅ Withdrawal is requested`);
    }
  } catch (error: any) {
    console.error(`  ❌ Error checking withdrawal: ${error.message}`);
    throw error;
  }

  // Step 2: Finalize withdrawal on Bridge2
  console.log("\n" + "=".repeat(80));
  console.log("Step 2: Finalizing withdrawal on Bridge2");
  console.log("=".repeat(80));
  
  try {
    console.log(`  Calling batchedFinalizeWithdrawals with message: ${messageHash}`);
    
    // Check if we need to wait for dispute period
    const requestedWithdrawal = await bridge2Contract.requestedWithdrawals(messageHash);
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const requestedTime = requestedWithdrawal.requestedTime;
    
    // Get dispute period (default is usually 86400 seconds = 1 day)
    let disputePeriodSeconds = 86400n;
    try {
      disputePeriodSeconds = await bridge2Contract.disputePeriodSeconds();
    } catch (e) {
      console.log(`  ⚠️  Could not fetch dispute period, assuming 86400 seconds`);
    }
    
    const timeSinceRequest = currentTime - requestedTime;
    const timeRemaining = disputePeriodSeconds - timeSinceRequest;
    
    if (timeRemaining > 0n) {
      console.log(`  ⚠️  Dispute period not yet elapsed:`);
      console.log(`    Requested at: ${new Date(Number(requestedTime) * 1000).toISOString()}`);
      console.log(`    Current time: ${new Date(Number(currentTime) * 1000).toISOString()}`);
      console.log(`    Time remaining: ${timeRemaining} seconds (${Number(timeRemaining) / 3600} hours)`);
      console.log(`    You need to wait ${timeRemaining} seconds before finalizing.`);
      console.log(`    Or set a shorter DISPUTE_PERIOD_SECONDS when deploying (current: ${disputePeriodSeconds} seconds)`);
      throw new Error(`Dispute period not yet elapsed. Wait ${timeRemaining} seconds.`);
    } else {
      console.log(`  ✅ Dispute period has elapsed (${timeSinceRequest} seconds since request)`);
    }

    // Try static call first
    console.log(`  📤 Testing finalization with static call...`);
    try {
      await bridge2Contract.batchedFinalizeWithdrawals.staticCall([messageHash]);
      console.log(`  ✅ Static call succeeded - transaction should work`);
    } catch (staticError: any) {
      console.error(`  ❌ Static call failed:`);
      console.error(`     Message: ${staticError.message}`);
      if (staticError.reason) {
        console.error(`     Reason: ${staticError.reason}`);
      }
      throw staticError;
    }

    // Send the actual transaction
    console.log(`  📤 Sending finalization transaction...`);
    const finalizeTx = await bridge2Contract.batchedFinalizeWithdrawals([messageHash]);
    console.log(`  ✅ Transaction sent: ${finalizeTx.hash}`);
    console.log(`  ⏳ Waiting for confirmation...`);
    
    const receipt = await finalizeTx.wait();
    console.log(`  ✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`  ✅ Withdrawal finalized on Bridge2! USDC has been transferred.`);
  } catch (error: any) {
    console.error(`  ❌ Error finalizing withdrawal on Bridge2:`);
    console.error(`     ${error.message}`);
    throw error;
  }

  // Step 3: Finalize withdrawal on TxKeeper
  if (user && usd && nonce) {
    console.log("\n" + "=".repeat(80));
    console.log("Step 3: Finalizing withdrawal on TxKeeper");
    console.log("=".repeat(80));
    
    try {
      console.log(`  Calling finalizeWithdrawal:`);
      console.log(`    User: ${user}`);
      console.log(`    Destination: ${destination}`);
      console.log(`    Amount: ${usd} (raw units) = ${usd / 1e6} USDC`);
      console.log(`    Nonce: ${nonce}`);
      
      const txKeeperTx = await txKeeperContract.finalizeWithdrawal(
        user,
        destination,
        usd,
        nonce
      );
      console.log(`  ✅ Transaction sent: ${txKeeperTx.hash}`);
      console.log(`  ⏳ Waiting for confirmation...`);
      
      const receipt = await txKeeperTx.wait();
      console.log(`  ✅ Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`  ✅ WithdrawalFinalized event emitted on TxKeeper!`);
      console.log(`  ✅ tx-listener will now subtract the balance from the user.`);
    } catch (error: any) {
      console.error(`  ❌ Error finalizing withdrawal on TxKeeper:`);
      console.error(`     ${error.message}`);
      console.error(`  ⚠️  Note: Bridge2 withdrawal was successful, but TxKeeper finalization failed.`);
      console.error(`  ⚠️  You may need to manually call finalizeWithdrawal on TxKeeper.`);
    }
  } else {
    console.log("\n" + "=".repeat(80));
    console.log("Step 3: Skipping TxKeeper finalization");
    console.log("=".repeat(80));
    console.log(`  ⚠️  USER_ADDRESS, USD_AMOUNT, and NONCE not provided.`);
    console.log(`  ⚠️  To finalize on TxKeeper, set these environment variables and run again.`);
    console.log(`  ⚠️  Or manually call: TxKeeper.finalizeWithdrawal(user, destination, usd, nonce)`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("Withdrawal Finalization Complete!");
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

