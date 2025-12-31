import { run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const contractAddress = process.env.BRIDGE2_ADDRESS || process.argv[2];
  
  if (!contractAddress) {
    throw new Error(
      "Please provide contract address:\n" +
      "  - Set BRIDGE2_ADDRESS in .env file, or\n" +
      "  - Pass as first argument: npm run verify:bridge2 <address>"
    );
  }

  // Get constructor arguments from environment
  const hotAddresses = process.env.HOT_ADDRESSES?.split(",").map(addr => addr.trim()) || [];
  const coldAddresses = process.env.COLD_ADDRESSES?.split(",").map(addr => addr.trim()) || [];
  const powers = process.env.POWERS?.split(",").map(p => parseInt(p.trim())) || [];
  const usdcAddress = process.env.USDC_ADDRESS || "";
  const disputePeriodSeconds = parseInt(process.env.DISPUTE_PERIOD_SECONDS || "86400");
  const blockDurationMillis = parseInt(process.env.BLOCK_DURATION_MILLIS || "250");
  const lockerThreshold = parseInt(process.env.LOCKER_THRESHOLD || "3");

  if (hotAddresses.length === 0 || coldAddresses.length === 0 || powers.length === 0) {
    throw new Error(
      "Please set HOT_ADDRESSES, COLD_ADDRESSES, and POWERS in .env file.\n" +
      "These should match the values used during deployment."
    );
  }

  if (!usdcAddress) {
    throw new Error("Please set USDC_ADDRESS in .env file.");
  }

  if (hotAddresses.length !== coldAddresses.length || hotAddresses.length !== powers.length) {
    throw new Error(
      "HOT_ADDRESSES, COLD_ADDRESSES, and POWERS must have the same length.\n" +
      `Got: ${hotAddresses.length} hot, ${coldAddresses.length} cold, ${powers.length} powers`
    );
  }

  const constructorArgs = [
    hotAddresses,
    coldAddresses,
    powers,
    usdcAddress,
    disputePeriodSeconds,
    blockDurationMillis,
    lockerThreshold,
  ];

  console.log("Verifying Bridge2 contract...");
  console.log("Contract address:", contractAddress);
  console.log("Constructor arguments:");
  console.log("  Hot addresses:", hotAddresses);
  console.log("  Cold addresses:", coldAddresses);
  console.log("  Powers:", powers);
  console.log("  USDC address:", usdcAddress);
  console.log("  Dispute period (seconds):", disputePeriodSeconds);
  console.log("  Block duration (millis):", blockDurationMillis);
  console.log("  Locker threshold:", lockerThreshold);

  // Get network from Hardhat runtime environment (set via --network flag)
  const networkName = network.name;

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });
    console.log("\n✅ Contract verified successfully!");
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("\n✅ Contract is already verified!");
    } else {
      console.error("\n❌ Verification failed:");
      console.error(error);
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


