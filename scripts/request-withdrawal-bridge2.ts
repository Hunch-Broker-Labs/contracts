import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Note: In Hardhat scripts, ethers is imported from "hardhat" which provides
// the configured provider and network-specific ethers instance

dotenv.config();

// Load the full Bridge2 ABI from the compiled artifact to ensure it matches exactly
// This ensures the ABI matches the deployed contract bytecode
const artifactPath = path.join(__dirname, "../artifacts/src/Bridge2.sol/Bridge2.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
const BRIDGE2_ABI = artifact.abi;

// Signature.sol ABI for message creation
const SIGNATURE_ABI = [
  "function makeDomainSeparator() view returns (bytes32)",
];

interface WithdrawalRequest {
  user: string;
  destination: string;
  usd: number;
  nonce: number;
  signatures: Array<{
    v: number;
    r: string;
    s: string;
  }>;
}

interface ValidatorSet {
  epoch: number;
  validators: string[];
  powers: number[];
}

// EIP-712 constants matching Signature.sol
const EIP712_DOMAIN_SEPARATOR = ethers.keccak256(
  ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
);

const AGENT_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes("Agent(string source,bytes32 connectionId)")
);

/**
 * Creates the withdrawal message hash (same as contract and validators)
 */
function createWithdrawalMessage(
  user: string,
  destination: string,
  usd: number,
  nonce: number,
  bridgeAddress: string
): string {
  // Step 1: Create data hash (matches contract line 287)
  const data = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "address", "address", "uint64", "uint64"],
      ["requestWithdrawal", user, destination, usd, nonce]
    )
  );

  // Step 2: Create connectionId (matches contract makeMessage)
  const connectionId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32"],
      [bridgeAddress, data]
    )
  );

  // Step 3: Hash Agent struct (matches Signature.sol hash function)
  const agentSourceHash = ethers.keccak256(ethers.toUtf8Bytes("a"));
  const message = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32"],
      [AGENT_TYPEHASH, agentSourceHash, connectionId]
    )
  );

  return message;
}

/**
 * Creates the EIP-712 domain separator.
 * Must match Signature.sol makeDomainSeparator function.
 */
function createDomainSeparator(chainId: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        EIP712_DOMAIN_SEPARATOR,
        ethers.keccak256(ethers.toUtf8Bytes("Exchange")),
        ethers.keccak256(ethers.toUtf8Bytes("1")),
        chainId,
        "0x0000000000000000000000000000000000000000", // VERIFYING_CONTRACT = address(0)
      ]
    )
  );
}

/**
 * Signs a withdrawal request using EIP-712.
 * Returns the signature in {r, s, v} format.
 */
async function signWithdrawal(
  user: string,
  destination: string,
  usd: number,
  nonce: number,
  bridgeAddress: string,
  chainId: bigint,
  signer: any // ethers.Wallet from hardhat
): Promise<{ v: number; r: string; s: string }> {
  // Create message hash
  const message = createWithdrawalMessage(user, destination, usd, nonce, bridgeAddress);

  // Create domain separator
  const domainSeparator = createDomainSeparator(chainId);

  // Create EIP-712 digest
  // Contract uses: keccak256(abi.encodePacked("\x19\x01", domainSeparator, dataHash))
  const digest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      domainSeparator,
      message,
    ])
  );

  // Sign the digest
  const signature = await signer.signingKey.sign(digest);
  
  // Convert to {r, s, v} format
  const v = Number(signature.v);
  
  return {
    r: signature.r,
    s: signature.s,
    v: v >= 27 ? v : v + 27, // Ensure v is 27 or 28
  };
}

async function main() {
  console.log("=".repeat(80));
  console.log("Bridge2 Withdrawal Request Script");
  console.log("=".repeat(80));

  // Load configuration from environment
  const bridgeAddress = process.env.BRIDGE2_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!bridgeAddress) {
    throw new Error("BRIDGE2_ADDRESS environment variable is required");
  }
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  // Get withdrawal parameters from command line or environment
  const user = process.env.USER_ADDRESS || process.argv[2];
  const destination = process.env.DESTINATION_ADDRESS || process.argv[3] || user;
  const usd = parseInt(process.env.USD_AMOUNT || process.argv[4] || "1000000"); // Default 1 USDC in raw units
  const nonce = parseInt(process.env.NONCE || process.argv[5] || "1");

  if (!user) {
    throw new Error("User address is required. Set USER_ADDRESS env var or pass as first argument");
  }

  // Load validator set from environment
  const validatorAddresses = process.env.VALIDATOR_ADDRESSES?.split(",").map(addr => addr.trim()) || [];
  const validatorPowers = process.env.VALIDATOR_POWERS?.split(",").map(p => parseInt(p.trim())) || [];
  const epoch = parseInt(process.env.VALIDATOR_SET_EPOCH || "0");

  if (validatorAddresses.length === 0 || validatorPowers.length === 0) {
    throw new Error("VALIDATOR_ADDRESSES and VALIDATOR_POWERS environment variables are required");
  }

  if (validatorAddresses.length !== validatorPowers.length) {
    throw new Error("VALIDATOR_ADDRESSES and VALIDATOR_POWERS must have the same length");
  }

  // Load validator private keys from environment
  // Format: "privateKey1,privateKey2,privateKey3" (must match validator order)
  const validatorPrivateKeys = process.env.VALIDATOR_PRIVATE_KEYS?.split(",").map(key => key.trim()) || [];

  if (validatorPrivateKeys.length === 0) {
    throw new Error("VALIDATOR_PRIVATE_KEYS environment variable is required (comma-separated)");
  }

  if (validatorPrivateKeys.length !== validatorAddresses.length) {
    throw new Error(`VALIDATOR_PRIVATE_KEYS count (${validatorPrivateKeys.length}) must match VALIDATOR_ADDRESSES count (${validatorAddresses.length})`);
  }

  // Verify that private keys match validator addresses
  console.log("\n🔐 Verifying validator private keys match addresses...");
  for (let i = 0; i < validatorPrivateKeys.length; i++) {
    const wallet = new ethers.Wallet(validatorPrivateKeys[i]);
    const expectedAddress = validatorAddresses[i].toLowerCase();
    const actualAddress = wallet.address.toLowerCase();
    
    if (actualAddress !== expectedAddress) {
      throw new Error(
        `Validator ${i} private key mismatch!\n` +
        `  Expected address: ${expectedAddress}\n` +
        `  Actual address:   ${actualAddress}\n` +
        `  Make sure VALIDATOR_PRIVATE_KEYS are in the same order as VALIDATOR_ADDRESSES`
      );
    }
    console.log(`  ✅ Validator ${i}: ${actualAddress} matches`);
  }

  console.log("\nConfiguration:");
  console.log(`  Bridge Address: ${bridgeAddress}`);
  console.log(`  User: ${user}`);
  console.log(`  Destination: ${destination}`);
  console.log(`  Amount: ${usd} (raw units) = ${usd / 1e6} USDC`);
  console.log(`  Nonce: ${nonce}`);
  console.log(`  Validators: ${validatorAddresses.length}`);
  console.log(`  Epoch: ${epoch}`);

  // Setup provider and signer using Hardhat's provider
  // Use Hardhat's provider (already configured for the network)
  const signer = new ethers.Wallet(privateKey, ethers.provider);
  
  // Verify contract address has code
  console.log("\n🔍 Verifying contract address...");
  const code = await ethers.provider.getCode(bridgeAddress);
  if (code === "0x") {
    throw new Error(`No contract code found at address ${bridgeAddress}. Make sure the contract is deployed.`);
  }
  console.log(`  ✅ Contract has code at ${bridgeAddress}`);
  
  // Try to verify the contract has the expected function
  try {
    const contract = new ethers.Contract(bridgeAddress, BRIDGE2_ABI, signer);
    // Try to call a view function to verify the contract is correct
    await contract.hotValidatorSetHash();
    console.log(`  ✅ Contract responds to hotValidatorSetHash() - address is correct`);
  } catch (error: any) {
    console.error(`  ❌ Contract at ${bridgeAddress} does not appear to be Bridge2`);
    console.error(`  Error: ${error.message}`);
    throw new Error(`Invalid contract address or contract not deployed. Expected Bridge2 contract at ${bridgeAddress}`);
  }
  
  const contract = new ethers.Contract(bridgeAddress, BRIDGE2_ABI, signer);
    

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`  Chain ID: ${chainId}`);
  console.log(`  Transaction signer address: ${signer.address}`);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`  Transaction signer balance: ${ethers.formatEther(balance)} ETH`);

  // Create withdrawal message hash
  const message = createWithdrawalMessage(user, destination, usd, nonce, bridgeAddress);
  console.log(`\n  Withdrawal message hash: ${message}`);

  // Sign with each validator's private key
  console.log("\n✍️  Signing withdrawal request with validator private keys...");
  const validatorSignatures: Array<{ validator: string; signature: { v: number; r: string; s: string } }> = [];
  
  for (let i = 0; i < validatorPrivateKeys.length; i++) {
    const validatorWallet = new ethers.Wallet(validatorPrivateKeys[i]);
    const validatorAddress = validatorWallet.address;
    
    console.log(`  Signing with validator ${i}: ${validatorAddress}...`);
    
    const signature = await signWithdrawal(
      user,
      destination,
      usd,
      nonce,
      bridgeAddress,
      chainId,
      validatorWallet
    );
    
    validatorSignatures.push({
      validator: validatorAddress,
      signature: signature,
    });
    
    console.log(`    ✅ Signed (v=${signature.v})`);
  }

  // Order signatures to match validator set order (critical for contract verification)
  const signatures: Array<{ v: number; r: string; s: string }> = [];
  for (let i = 0; i < validatorAddresses.length; i++) {
    const validatorAddress = validatorAddresses[i].toLowerCase();
    const sigEntry = validatorSignatures.find(s => s.validator.toLowerCase() === validatorAddress);
    
    if (!sigEntry) {
      throw new Error(`No signature found for validator ${i}: ${validatorAddress}`);
    }
    
    signatures.push(sigEntry.signature);
  }
  
  console.log(`\n✅ Generated ${signatures.length} signatures in validator set order`);

  // Verify validator set hash
  try {
    const onChainHash = await contract.hotValidatorSetHash();
    console.log(`\n  On-chain hotValidatorSetHash: ${onChainHash}`);

    // Calculate our validator set hash
    const validatorSetData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint64[]", "uint64"],
      [validatorAddresses, validatorPowers, epoch]
    );
    const ourHash = ethers.keccak256(validatorSetData);
    console.log(`  Our validator set hash: ${ourHash}`);

    if (onChainHash.toLowerCase() !== ourHash.toLowerCase()) {
      console.warn("\n⚠️  WARNING: Validator set hash mismatch!");
      console.warn("   This will cause the transaction to revert.");
    } else {
      console.log("\n✅ Validator set hash matches on-chain hash");
    }
  } catch (error) {
    console.warn("\n⚠️  Could not verify validator set hash:", error);
  }

  // Check if withdrawal was already requested
  console.log("\n🔍 Checking if withdrawal already exists...");
  try {
    const requestedTime = await contract.requestedWithdrawals(message);
    console.log(`  requestedWithdrawals[${message}] = ${requestedTime}`);
    if (requestedTime > 0) {
      console.error(`\n❌ ERROR: Withdrawal already requested at timestamp ${requestedTime}`);
      console.error(`   Message: ${message}`);
      console.error(`   User: ${user}, Destination: ${destination}, Amount: ${usd}, Nonce: ${nonce}`);
      console.error(`   This will cause the transaction to revert with FailedWithdrawal event (error code 0).`);
      console.error(`   Solution: Use a different nonce or wait for this withdrawal to be finalized.`);
      throw new Error(`Withdrawal already requested. Use a different nonce.`);
    } else {
      console.log(`  ✅ Withdrawal not yet requested`);
    }
  } catch (error: any) {
    if (error.message && error.message.includes("already requested")) {
      throw error;
    }
    console.warn("\n⚠️  Could not check withdrawal status:", error);
  }

  // Verify signatures can be recovered correctly
  console.log("\n🔍 Verifying signature recovery...");
  let allSignaturesValid = true;
  
  // Calculate domain separator (same as contract uses)
  // The contract uses Signature.sol's makeDomainSeparator which uses:
  // - name: "Exchange"
  // - version: "1"
  // - chainId: block.chainid
  // - verifyingContract: address(0)
  const domainSeparator = createDomainSeparator(chainId);
  console.log(`  Calculated domain separator: ${domainSeparator}`);
  
  // Recover each signature and verify it matches the validator
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    const expectedValidator = validatorAddresses[i];
    
    // Create digest (same as contract's recoverSigner function)
    // Contract uses: keccak256(abi.encodePacked("\x19\x01", domainSeparator, dataHash))
    const digest = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes("\x19\x01"),
        domainSeparator,
        message,
      ])
    );
    
    // Recover signer
    const recoveredAddress = ethers.recoverAddress(
      digest,
      {
        r: sig.r,
        s: sig.s,
        v: sig.v,
      }
    );
    
    const matches = recoveredAddress.toLowerCase() === expectedValidator.toLowerCase();
    console.log(`  Signature ${i}: ${matches ? "✅" : "❌"} ${recoveredAddress} ${matches ? "matches" : `(expected ${expectedValidator})`}`);
    
    if (!matches) {
      console.error(`\n❌ Signature ${i} recovery failed!`);
      console.error(`   Expected: ${expectedValidator}`);
      console.error(`   Recovered: ${recoveredAddress}`);
      console.error(`   Message: ${message}`);
      console.error(`   Digest: ${digest}`);
      console.error(`   This will cause the transaction to revert.`);
      allSignaturesValid = false;
    }
  }
  
  if (!allSignaturesValid) {
    console.error("\n❌ Signature verification failed. Transaction will revert.");
    throw new Error("Signature verification failed");
  } else {
    console.log("\n✅ All signatures verified successfully");
  }

  // Calculate total power and verify quorum
  console.log("\n🔍 Verifying quorum requirements...");
  const totalPower = validatorPowers.reduce((sum, power) => sum + power, 0);
  const signedPower = validatorPowers.reduce((sum, power) => sum + power, 0); // All validators signed
  const requiredPower = Math.ceil((2 * totalPower) / 3);
  console.log(`  Total validator power: ${totalPower}`);
  console.log(`  Signed validator power: ${signedPower}`);
  console.log(`  Required power (2/3+): ${requiredPower}`);
  
  if (signedPower < requiredPower) {
    console.error(`\n❌ Insufficient validator power!`);
    console.error(`   Signed: ${signedPower}, Required: ${requiredPower}`);
    console.error(`   This will cause the transaction to revert.`);
    throw new Error(`Insufficient validator power: ${signedPower}/${totalPower} (required: ${requiredPower})`);
  } else {
    console.log(`  ✅ Quorum requirement met (${signedPower} >= ${requiredPower})`);
  }

  // Prepare withdrawal request
  const withdrawalRequest: WithdrawalRequest = {
    user,
    destination,
    usd,
    nonce,
    signatures,
  };

  // Prepare validator set
  const hotValidatorSet: ValidatorSet = {
    epoch,
    validators: validatorAddresses,
    powers: validatorPowers,
  };

  // Print detailed data
  console.log("\n" + "=".repeat(80));
  console.log("DATA BEING SENT TO CONTRACT:");
  console.log("=".repeat(80));
  console.log("\nWithdrawal Request:");
  console.log(JSON.stringify({
    user: withdrawalRequest.user,
    destination: withdrawalRequest.destination,
    usd: withdrawalRequest.usd,
    nonce: withdrawalRequest.nonce,
    signaturesCount: withdrawalRequest.signatures.length,
    signatures: withdrawalRequest.signatures.map((sig, idx) => ({
      index: idx,
      validator: validatorAddresses[idx],
      v: sig.v,
      r: sig.r.substring(0, 20) + "..." + sig.r.substring(sig.r.length - 6),
      s: sig.s.substring(0, 20) + "..." + sig.s.substring(sig.s.length - 6),
    })),
  }, null, 2));
  console.log("\nHot Validator Set:");
  console.log(JSON.stringify({
    epoch: hotValidatorSet.epoch,
    validators: hotValidatorSet.validators,
    powers: hotValidatorSet.powers,
  }, null, 2));
  console.log("=".repeat(80));

  // Print final data summary before attempting transaction
  console.log("\n" + "=".repeat(80));
  console.log("FINAL CHECK BEFORE TRANSACTION:");
  console.log("=".repeat(80));
  console.log(`Message hash: ${message}`);
  console.log(`User: ${user}`);
  console.log(`Destination: ${destination}`);
  console.log(`Amount: ${usd} (${usd / 1e6} USDC)`);
  console.log(`Nonce: ${nonce}`);
  console.log(`Signatures: ${signatures.length}`);
  console.log(`Validators: ${validatorAddresses.length}`);
  console.log(`Epoch: ${epoch}`);
  console.log("=".repeat(80));

  // Verify function exists in contract
  console.log("\n🔍 Verifying function exists in contract...");
  try {
    // Check if we can encode the function call
    const iface = new ethers.Interface(BRIDGE2_ABI);
    const functionFragment = iface.getFunction("batchedRequestWithdrawals");
    if (!functionFragment) {
      throw new Error("Function 'batchedRequestWithdrawals' not found in ABI");
    }
    console.log(`  ✅ Function 'batchedRequestWithdrawals' found in ABI`);
    console.log(`  Function signature: ${functionFragment.format()}`);
    
    // Get the function selector
    const functionSelector = iface.getFunction("batchedRequestWithdrawals")?.selector;
    console.log(`  Function selector: ${functionSelector}`);
    
    // Try to encode the call to verify it works
    try {
      const encoded = iface.encodeFunctionData("batchedRequestWithdrawals", [[withdrawalRequest], hotValidatorSet]);
      console.log(`  ✅ Function call encoding successful (${encoded.length} bytes)`);
      console.log(`  Encoded call starts with selector: ${encoded.substring(0, 10)}`);
      
      // Check if the contract recognizes this selector by trying a low-level call
      console.log(`  🔍 Checking if contract recognizes function selector...`);
      try {
        // Try a low-level call to see if the function exists
        const callData = encoded;
        const result = await ethers.provider.call({
          to: bridgeAddress,
          data: callData,
        });
        console.log(`  ✅ Contract responded to function call (result: ${result.substring(0, 20)}...)`);
      } catch (callError: any) {
        console.error(`  ❌ Contract does not recognize function selector`);
        console.error(`  This likely means the contract was deployed without this function`);
        console.error(`  Error: ${callError.message}`);
        throw new Error(`Contract at ${bridgeAddress} does not have function 'batchedRequestWithdrawals'. Please redeploy the contract.`);
      }
    } catch (encodeError: any) {
      console.error(`  ❌ Failed to encode function call: ${encodeError.message}`);
      throw encodeError;
    }
  } catch (error: any) {
    console.error(`  ❌ Function verification failed`);
    console.error(`  Error: ${error.message}`);
    throw error;
  }

  // Try static call first to get revert reason
  console.log("\n📤 Testing withdrawal request with static call...");
  try {
    // Use callStatic with more gas to ensure it doesn't fail due to gas estimation
    const result = await contract.batchedRequestWithdrawals.staticCall(
      [withdrawalRequest], 
      hotValidatorSet,
      { gasLimit: 5000000 } // Use high gas limit for static call
    );
    console.log("✅ Static call succeeded - transaction should work");
  } catch (staticError: any) {
    console.error("\n❌ Static call failed:");
    console.error(`   Message: ${staticError.message}`);
    console.error(`   Code: ${staticError.code}`);
    
    // Check for specific error patterns
    if (staticError.message.includes("already requested") || staticError.message.includes("FailedWithdrawal")) {
      console.error(`   ⚠️  Withdrawal was already requested. Use a different nonce.`);
    } else if (staticError.message.includes("signatures") || staticError.message.includes("power")) {
      console.error(`   ⚠️  Signature verification failed. Check signature recovery above.`);
    } else if (staticError.message.includes("validator set")) {
      console.error(`   ⚠️  Validator set mismatch. Check validator set hash above.`);
    }
    
    if (staticError.reason) {
      console.error(`   Reason: ${staticError.reason}`);
    }
    if (staticError.data && staticError.data !== "0x") {
      console.error(`   Data: ${staticError.data}`);
      // Try to decode the revert reason
      try {
        // Try to decode as a string error (Error(string))
        if (staticError.data.length >= 138) { // 4 bytes selector + 32 bytes offset + 32 bytes length + at least 1 byte string
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + staticError.data.slice(138));
          console.error(`   Decoded error message: ${decoded[0]}`);
        }
      } catch (decodeError) {
        // Try custom error format
        console.error(`   Could not decode error data. Raw data: ${staticError.data.substring(0, 100)}...`);
      }
    } else {
      console.error(`   ⚠️  No error data returned. This usually means a require(false) without a message.`);
      console.error(`   Common causes:`);
      console.error(`   1. Withdrawal already requested (check above)`);
      console.error(`   2. Signature verification failed (check signature recovery above)`);
      console.error(`   3. Validator set hash mismatch (check above)`);
      console.error(`   4. Insufficient validator power (need 2/3+ of total power)`);
    }
    
    console.error("\n⚠️  Transaction will fail. Fix the issues above before sending.");
    throw staticError;
  }

  // Request withdrawal
  console.log("\n📤 Sending transaction to Bridge2 contract...");
  try {
    const tx = await contract.batchedRequestWithdrawals([withdrawalRequest], hotValidatorSet);
    console.log(`✅ Transaction sent: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  } catch (error: any) {
    console.error("\n❌ Error requesting withdrawal:");
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    if (error.reason) {
      console.error(`   Reason: ${error.reason}`);
    }
    if (error.data) {
      console.error(`   Data: ${error.data}`);
    }
    // If we didn't catch it in static call, try to decode here too
    if (error.data && error.data !== "0x" && error.data.length > 10) {
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + error.data.slice(10));
        console.error(`   Decoded error: ${decoded[0]}`);
      } catch (decodeError) {
        // Ignore decode errors
      }
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


