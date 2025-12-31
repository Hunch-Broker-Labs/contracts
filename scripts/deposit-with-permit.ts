import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

/**
 * Script to deposit tokens to Bridge2 using EIP-2612 permit
 * 
 * Usage:
 *   npx hardhat run scripts/deposit-with-permit.ts --network arbitrum
 * 
 * The script will prompt for required inputs interactively.
 * Environment variables can be used as defaults (optional):
 *   - BRIDGE2_ADDRESS: Address of the deployed Bridge2 contract
 *   - USDC_ADDRESS: Address of the ERC20 token (must support ERC20Permit)
 *   - PRIVATE_KEY: Private key of the user making the deposit (recommended to use .env for security)
 */

interface Signature {
  r: string;
  s: string;
  v: number;
}

// Helper function to create readline interface
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Helper function to prompt for input
function question(rl: readline.Interface, query: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

// Helper function to validate Ethereum address
function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

// Helper function to validate amount
function isValidAmount(amount: string): boolean {
  try {
    const num = BigInt(amount);
    return num > 0n;
  } catch {
    return false;
  }
}

async function main() {
  const rl = createInterface();

  try {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║     Hunch Bridge - Deposit with Permit (EIP-2612)         ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    // Get private key (prefer env var for security)
    let privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      privateKey = await question(
        rl,
        "Enter your private key (or set PRIVATE_KEY in .env for security)"
      );
      if (!privateKey) {
        throw new Error("Private key is required");
      }
      if (!privateKey.startsWith("0x")) {
        privateKey = "0x" + privateKey;
      }
    } else {
      console.log("✓ Using PRIVATE_KEY from environment\n");
    }

    const wallet = new ethers.Wallet(privateKey);
    const provider = ethers.provider;
    const signer = wallet.connect(provider);

    console.log("Account address:", signer.address);
    const ethBalance = await provider.getBalance(signer.address);
    console.log("ETH balance:", ethers.formatEther(ethBalance), "ETH\n");

    // Get Bridge2 address
    let bridge2Address = process.env.BRIDGE2_ADDRESS;
    if (!bridge2Address) {
      bridge2Address = await question(rl, "Enter Bridge2 contract address");
    } else {
      console.log(`✓ Bridge2 address: ${bridge2Address}`);
      const useDefault = await question(rl, "Use this address? (Y/n)", "Y");
      if (useDefault.toLowerCase() !== "y" && useDefault.toLowerCase() !== "yes") {
        bridge2Address = await question(rl, "Enter Bridge2 contract address");
      }
    }

    if (!isValidAddress(bridge2Address)) {
      throw new Error("Invalid Bridge2 address");
    }

    // Get token address
    let usdcAddress = process.env.USDC_ADDRESS;
    if (!usdcAddress) {
      usdcAddress = await question(rl, "Enter ERC20 token address (must support ERC20Permit)");
    } else {
      console.log(`✓ Token address: ${usdcAddress}`);
      const useDefault = await question(rl, "Use this address? (Y/n)", "Y");
      if (useDefault.toLowerCase() !== "y" && useDefault.toLowerCase() !== "yes") {
        usdcAddress = await question(rl, "Enter ERC20 token address");
      }
    }

    if (!isValidAddress(usdcAddress)) {
      throw new Error("Invalid token address");
    }

    console.log("\n" + "─".repeat(60) + "\n");

    // Get contract instances
    const Bridge2 = await ethers.getContractAt("Bridge2", bridge2Address);
    const ERC20Permit = await ethers.getContractAt("ERC20Permit", usdcAddress);

    // Get token info
    const tokenName = await ERC20Permit.name();
    const tokenSymbol = await ERC20Permit.symbol();
    const tokenDecimals = await ERC20Permit.decimals();
    const tokenBalance = await ERC20Permit.balanceOf(signer.address);

    console.log(`Token: ${tokenName} (${tokenSymbol})`);
    console.log(`Token decimals: ${tokenDecimals}`);
    console.log(`Your token balance: ${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}\n`);

    // Get deposit amount
    const defaultAmount = process.env.DEPOSIT_AMOUNT || "1000000";
    let depositAmountStr = await question(
      rl,
      `Enter deposit amount (in token units, e.g., 1000000 = 1 token with 6 decimals)`,
      defaultAmount
    );

    if (!isValidAmount(depositAmountStr)) {
      throw new Error("Invalid deposit amount");
    }

    const depositAmount = BigInt(depositAmountStr);

    if (tokenBalance < depositAmount) {
      throw new Error(
        `Insufficient balance. Have ${ethers.formatUnits(tokenBalance, tokenDecimals)}, need ${ethers.formatUnits(depositAmount, tokenDecimals)}`
      );
    }

    console.log(`\nDeposit amount: ${ethers.formatUnits(depositAmount, tokenDecimals)} ${tokenSymbol}`);

    // Get deadline (optional)
    const defaultDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const defaultDeadlineStr = process.env.DEADLINE || defaultDeadline.toString();
    let deadlineStr = await question(
      rl,
      `Enter permit deadline (Unix timestamp, default: 1 hour from now)`,
      defaultDeadlineStr
    );

    const deadline = deadlineStr ? BigInt(deadlineStr) : defaultDeadline;
    const deadlineDate = new Date(Number(deadline) * 1000);
    console.log(`Permit deadline: ${deadlineDate.toISOString()}\n`);

      // Confirm before proceeding
    console.log("Summary:");
    console.log(`  Account: ${signer.address}`);
    console.log(`  Bridge2: ${bridge2Address}`);
    console.log(`  Token: ${tokenName} (${usdcAddress})`);
    console.log(`  Amount: ${ethers.formatUnits(depositAmount, tokenDecimals)} ${tokenSymbol}`);
    console.log(`  Deadline: ${deadlineDate.toISOString()}\n`);

    const confirm = await question(rl, "Proceed with deposit? (y/N)", "N");
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("Deposit cancelled.");
      rl.close();
      return;
    }

    console.log("\n" + "─".repeat(60) + "\n");

      // Get domain separator for EIP-2612 permit
    const chainId = await provider.getNetwork().then(n => n.chainId);
    const domain = {
      name: tokenName,
      version: "1",
      chainId: chainId,
      verifyingContract: usdcAddress,
    };

    // Create permit message
    const permitTypes = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    // Get nonce for permit
    const nonce = await ERC20Permit.nonces(signer.address);
    console.log(`Permit nonce: ${nonce}`);

    const permitMessage = {
      owner: signer.address,
      spender: bridge2Address,
      value: depositAmount,
      nonce: nonce,
      deadline: deadline,
    };

    // Sign the permit
    console.log("Signing permit...");
    const signature = await signer.signTypedData(domain, permitTypes, permitMessage);

    // Split signature into r, s, v
    const sig = ethers.Signature.from(signature);

    // Convert v to 27 or 28 (Solidity expects 27 or 28, not 0 or 1)
    let v = sig.v;
    if (v < 27) {
      v = v + 27;
    }

    const permitSignature: Signature = {
      r: sig.r,
      s: sig.s,
      v: v,
    };

    console.log("✓ Permit signature created\n");

    // Prepare deposit data
    // Note: Contract expects uint64 for usd and deadline, so we ensure values fit
    const MAX_UINT64 = BigInt("18446744073709551615"); // 2^64 - 1
    if (depositAmount > MAX_UINT64) {
      throw new Error(`Deposit amount ${depositAmount} exceeds uint64 max value`);
    }
    if (deadline > MAX_UINT64) {
      throw new Error(`Deadline ${deadline} exceeds uint64 max value`);
    }

    const depositData = {
      user: signer.address,
      usd: depositAmount,
      deadline: deadline,
      signature: permitSignature,
    };

    // Get balance before deposit
    const balanceBefore = await ERC20Permit.balanceOf(signer.address);
    const bridgeBalanceBefore = await ERC20Permit.balanceOf(bridge2Address);

    // Call batchedDepositWithPermit
    console.log("Calling batchedDepositWithPermit...");
    const tx = await Bridge2.batchedDepositWithPermit([depositData]);
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✓ Transaction confirmed in block:", receipt?.blockNumber);

    // Check for FailedPermitDeposit event
    const failedEvent = receipt?.logs.find((log: any) => {
      try {
        const parsed = Bridge2.interface.parseLog(log);
        return parsed?.name === "FailedPermitDeposit";
      } catch {
        return false;
      }
    });

    console.log("\n" + "─".repeat(60) + "\n");

    if (failedEvent) {
      const parsed = Bridge2.interface.parseLog(failedEvent);
      console.log("❌ Deposit failed!");
      console.log("  User:", parsed?.args.user);
      console.log("  Amount:", ethers.formatUnits(parsed?.args.usd, tokenDecimals), tokenSymbol);
      console.log("  Error code:", parsed?.args.errorCode);
      console.log("  Error code 0 = permit failed, Error code 1 = transferFrom failed");
    } else {
      // Check balance changes to confirm success
      const balanceAfter = await ERC20Permit.balanceOf(signer.address);
      const bridgeBalanceAfter = await ERC20Permit.balanceOf(bridge2Address);

      const balanceDiff = balanceBefore - balanceAfter;
      const bridgeBalanceDiff = bridgeBalanceAfter - bridgeBalanceBefore;

      if (balanceDiff === depositAmount && bridgeBalanceDiff === depositAmount) {
        console.log("✅ Deposit successful!");
        console.log("  User:", signer.address);
        console.log("  Amount:", ethers.formatUnits(depositAmount, tokenDecimals), tokenSymbol);
        console.log("  Tokens transferred from user to bridge contract");
      } else {
        console.log("⚠️  Deposit may have failed or partially succeeded.");
        console.log("  Expected balance change:", ethers.formatUnits(depositAmount, tokenDecimals));
        console.log("  Actual balance change:", ethers.formatUnits(balanceDiff, tokenDecimals));
        console.log("  Bridge balance change:", ethers.formatUnits(bridgeBalanceDiff, tokenDecimals));
      }
    }

    // Check final balances
    const finalBalance = await ERC20Permit.balanceOf(signer.address);
    const finalBridgeBalance = await ERC20Permit.balanceOf(bridge2Address);
    console.log(`\nFinal token balance: ${ethers.formatUnits(finalBalance, tokenDecimals)} ${tokenSymbol}`);
    console.log(`Bridge token balance: ${ethers.formatUnits(finalBridgeBalance, tokenDecimals)} ${tokenSymbol}`);
  } finally {
    rl.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

