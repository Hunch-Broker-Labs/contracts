import { run, network, ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const address = process.argv[2] || process.env.TX_KEEPER_ADDRESS;
  
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

  if (!address) {
    throw new Error("Please provide TX_KEEPER_ADDRESS as argument or in .env");
  }

  console.log("Verifying TxKeeper contract at:", address);
  console.log("Admin address:", adminAddress);

  // Get network from Hardhat runtime environment (set via --network flag)
  const networkName = network.name;
  const networkInfo = await ethers.provider.getNetwork();
  console.log("Network:", networkName, "Chain ID:", networkInfo.chainId.toString());

  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: [adminAddress],
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

