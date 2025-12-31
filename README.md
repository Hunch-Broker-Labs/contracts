# Hunch Bridge Contracts

Smart contracts for the Hunch Bridge (Arbitrum ↔ Hyperliquid L1).

## Contracts

- **Bridge2.sol**: Main bridge contract (audited, production-ready)
- **Signature.sol**: EIP-712 signature utilities
- **TestERC20.sol**: ERC20 token with permit functionality for testing

## Setup

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Deploy

### Deploy Bridge2

1. Copy `.env.example` to `.env` and fill in values
2. Deploy to Arbitrum:
   ```bash
   npm run deploy:arbitrum
   ```
3. Deploy to Arbitrum Sepolia (testnet):
   ```bash
   npm run deploy:arbitrum-sepolia
   ```

### Deploy TestERC20 (for testing)

1. Deploy locally (Hardhat network):
   ```bash
   npm run deploy:erc20
   ```

2. Deploy to Arbitrum:
   ```bash
   npm run deploy:erc20:arbitrum
   ```

3. Deploy to Arbitrum Sepolia:
   ```bash
   npm run deploy:erc20:arbitrum-sepolia
   ```

## Verify Contracts

After deploying, verify your contracts on block explorers (Arbiscan).

### Verify TestERC20

1. Set the deployed contract address in `.env`:
   ```bash
   TEST_ERC20_ADDRESS=0x...
   ```

2. Ensure deployment parameters match (or set in `.env`):
   - `TOKEN_NAME`
   - `TOKEN_SYMBOL`
   - `TOKEN_DECIMALS`
   - `INITIAL_SUPPLY`

3. Verify on Arbitrum:
   ```bash
   npm run verify:erc20:arbitrum
   ```

4. Or verify on Arbitrum Sepolia:
   ```bash
   npm run verify:erc20:arbitrum-sepolia
   ```

5. Or pass address as argument:
   ```bash
   npm run verify:erc20:arbitrum 0x...
   ```

### Verify Bridge2

1. Set the deployed contract address in `.env`:
   ```bash
   BRIDGE2_ADDRESS=0x...
   ```

2. Ensure all deployment parameters are set in `.env` (must match deployment):
   - `HOT_ADDRESSES` (comma-separated)
   - `COLD_ADDRESSES` (comma-separated)
   - `POWERS` (comma-separated)
   - `USDC_ADDRESS`
   - `DISPUTE_PERIOD_SECONDS`
   - `BLOCK_DURATION_MILLIS`
   - `LOCKER_THRESHOLD`

3. Verify on Arbitrum:
   ```bash
   npm run verify:bridge2:arbitrum
   ```

4. Or verify on Arbitrum Sepolia:
   ```bash
   npm run verify:bridge2:arbitrum-sepolia
   ```

5. Or pass address as argument:
   ```bash
   npm run verify:bridge2:arbitrum 0x...
   ```

**Note**: Make sure `ARBISCAN_API_KEY` is set in your `.env` file for verification to work.

## Environment Variables

See `.env.example` for required variables.

### TestERC20 Deployment Variables (optional)

- `TOKEN_NAME`: Token name (default: "Test USDC")
- `TOKEN_SYMBOL`: Token symbol (default: "TUSDC")
- `TOKEN_DECIMALS`: Token decimals (default: 6)
- `INITIAL_SUPPLY`: Initial supply to mint (default: 1,000,000 tokens)

### Verification Variables

- `TEST_ERC20_ADDRESS`: Deployed TestERC20 contract address (for verification)
- `BRIDGE2_ADDRESS`: Deployed Bridge2 contract address (for verification)
- `ARBISCAN_API_KEY`: Arbiscan API key for contract verification

