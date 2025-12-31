#!/bin/bash

# Script to start a local Hardhat node and deploy contracts
# This allows you to see console.log output from contracts

echo "=========================================="
echo "Starting Local Hardhat Node"
echo "=========================================="
echo ""
echo "This will:"
echo "1. Start a local Hardhat node on https://sepolia-rollup.arbitrum.io/rpc"
echo "2. Provide 20 test accounts with 10000 ETH each"
echo "3. Show console.log output from contracts"
echo ""
echo "Press Ctrl+C to stop the node"
echo ""
echo "In another terminal, you can:"
echo "  - Deploy contracts: npm run deploy:local"
echo "  - Run withdrawal script: npm run request-withdrawal:local"
echo ""
echo "=========================================="
echo ""

# Start Hardhat node
npx hardhat node

