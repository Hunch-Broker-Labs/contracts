import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Create wallet from private key to avoid resolveName issues
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set in .env file");
  }
  
  const provider = ethers.provider;
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deploying TestERC20 with account:", deployer.address);
  if(deployer.address !== "0xe7D463DFf4E8c01040DafD137598d006292A7Aa3") {
    console.log("Account is not the deployer, skipping deployment");
    return;
  }
  
  // Fund the account if needed (for hardhat network)
  const network = await provider.getNetwork();
  if (network.chainId === 1337n) {
    // Hardhat network - fund the account
    const balance = await provider.getBalance(deployer.address);
    if (balance === 0n) {
      // Get a funded account to send from
      const [fundedAccount] = await ethers.getSigners();
      const tx = await fundedAccount.sendTransaction({
        to: deployer.address,
        value: ethers.parseEther("10000"),
      });
      await tx.wait();
    }
  }
  
  console.log("Account balance:", (await provider.getBalance(deployer.address)).toString());

  // Get deployment parameters from environment or use defaults
  const name = process.env.TOKEN_NAME || "Test USDC";
  const symbol = process.env.TOKEN_SYMBOL || "TUSDC";
  const decimals = parseInt(process.env.TOKEN_DECIMALS || "6");
  const initialSupply = process.env.INITIAL_SUPPLY 
    ? BigInt(process.env.INITIAL_SUPPLY) 
    : BigInt(1000000) * BigInt(10 ** decimals); // Default: 1,000,000 tokens

  console.log("Deployment parameters:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Initial Supply:", initialSupply.toString());

  const TestERC20 = await ethers.getContractFactory("TestERC20", deployer);
  const token = await TestERC20.deploy(
    name,
    symbol,
    decimals,
    initialSupply
  );

  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("\nTestERC20 deployed to:", address);
  console.log("\nSave this address for your .env files:");
  console.log(`USDC_ADDRESS=${address}`);
  console.log(`\nOr for testing:`);
  console.log(`TEST_TOKEN_ADDRESS=${address}`);
  
  // Verify initial supply
  const deployerBalance = await token.balanceOf(deployer.address);
  console.log(`\nDeployer balance: ${deployerBalance.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

