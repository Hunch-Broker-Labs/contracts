import { run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const contractAddress = process.env.TEST_ERC20_ADDRESS || process.argv[2];
  
  if (!contractAddress) {
    throw new Error(
      "Please provide contract address:\n" +
      "  - Set TEST_ERC20_ADDRESS in .env file, or\n" +
      "  - Pass as first argument: npm run verify:erc20 <address>"
    );
  }

  // Get constructor arguments from environment or use defaults
  const name = process.env.TOKEN_NAME || "Test USDC";
  const symbol = process.env.TOKEN_SYMBOL || "TUSDC";
  const decimals = parseInt(process.env.TOKEN_DECIMALS || "6");
  const initialSupply = process.env.INITIAL_SUPPLY 
    ? process.env.INITIAL_SUPPLY 
    : (BigInt(1000000) * BigInt(10 ** decimals)).toString();

  const constructorArgs = [
    name,
    symbol,
    decimals,
    initialSupply,
  ];

  console.log("Verifying TestERC20 contract...");
  console.log("Contract address:", contractAddress);
  console.log("Constructor arguments:");
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  Decimals:", decimals);
  console.log("  Initial Supply:", initialSupply);

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


