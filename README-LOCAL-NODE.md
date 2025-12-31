# Running Contracts on Local Hardhat Node

This guide explains how to run the contracts on a local Hardhat node to see `console.log` output from Solidity contracts.

## Why Local Node?

Hardhat's `console.log` only works on local Hardhat networks, not on testnets or mainnets. To debug and see contract logs, you need to run a local node.

## Quick Start

### 1. Start Local Node

In one terminal, start the Hardhat node:

```bash
cd contracts
npm run node
```

Or use the convenience script:

```bash
./scripts/start-local-node.sh
```

This will:
- Start a local blockchain on `https://sepolia-rollup.arbitrum.io/rpc`
- Provide 20 test accounts with 10000 ETH each
- Show all console.log output from contracts

### 2. Deploy Contracts

In another terminal, deploy both ERC20 and Bridge2 contracts to the local node:

**Option A: Deploy Both at Once (Recommended)**

```bash
cd contracts

# Deploy both ERC20 and Bridge2 in one command
npm run deploy-all:local
```

This will:
- Deploy TestERC20 token
- Deploy Bridge2 contract (using first 3 Hardhat accounts as validators by default)
- Print all addresses and environment variables you need

**Option B: Deploy Separately**

If you want to customize the deployment:

```bash
cd contracts

# First, deploy ERC20
export PRIVATE_KEY="0x7cff2a0ce30c112281b5dfbec2a58ebfb4de2f058183d9b55eab5a5a0913b1b2"
npx hardhat run scripts/deploy-erc20.ts --network localhost
# Copy the USDC_ADDRESS from output

# Then, deploy Bridge2
export HOT_ADDRESSES="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
export COLD_ADDRESSES="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
export POWERS="100,100,100"
export USDC_ADDRESS="0x..."  # From ERC20 deployment
export DISPUTE_PERIOD_SECONDS="86400"
export BLOCK_DURATION_MILLIS="250"
export PRIVATE_KEY="0x7cff2a0ce30c112281b5dfbec2a58ebfb4de2f058183d9b55eab5a5a0913b1b2"

npm run deploy:local
```

**Note:** The accounts shown when you start the node are the test accounts you can use. Copy the private key from the first account.

### 4. Run Withdrawal Request Script

After deploying, run the withdrawal request script:

```bash
# Set environment variables
export BRIDGE2_ADDRESS="0x..."  # From deployment output
export PRIVATE_KEY="0x7cff2a0ce30c112281b5dfbec2a58ebfb4de2f058183d9b55eab5a5a0913b1b2"
export USER_ADDRESS="0x..."  # User address
export VALIDATOR_ADDRESSES="0x3D150b0719B6CeF8403b5bE0964A19c486Cd5fB6,0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
export VALIDATOR_POWERS="100,100,100"
export VALIDATOR_SET_EPOCH="0"
export VALIDATOR_PRIVATE_KEYS="0x7cff2a0ce30c112281b5dfbec2a58ebfb4de2f058183d9b55eab5a5a0913b1b2,0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d,0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

# Run the script
npm run request-withdrawal:local
```

## Viewing Console Logs

When you run scripts against the local node, all `console.log` statements from the contracts will appear in the terminal where the Hardhat node is running.

For example, you'll see output like:
```
=== requestWithdrawal START ===
user: 0x...
destination: 0x...
usd: 1000000
nonce: 1
...
=== checkValidatorSignatures START ===
message hash: 0x...
...
```

## Test Accounts

The Hardhat node provides 20 test accounts. The first few are:

1. `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Private key: `0x7cff2a0ce30c112281b5dfbec2a58ebfb4de2f058183d9b55eab5a5a0913b1b2`)
2. `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Private key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`)
3. `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (Private key: `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`)

## Troubleshooting

1. **Port already in use**: If port 8545 is already in use, kill the process or change the port in `hardhat.config.ts`
2. **Contracts not deployed**: Make sure you deploy contracts to localhost before running scripts
3. **No console logs**: Ensure you're running against `localhost` network, not a testnet

## Stopping the Node

Press `Ctrl+C` in the terminal running the Hardhat node to stop it.

