#!/bin/bash

# Shadow Comparison Script Runner
# Runs the V1 vs V2 parser comparison against production database

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║         Shadow Comparison Script - V1 vs V2 Parser                        ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will:"
echo "  1. Connect to production MongoDB database"
echo "  2. Fetch whale addresses and their transactions"
echo "  3. Re-parse transactions with V2 parser"
echo "  4. Compare V2 results with V1 results in database"
echo "  5. Report matches, new discoveries, and regressions"
echo ""
echo "Configuration:"
echo "  - Batch Size: 5 whales"
echo "  - TX Limit: 20 transactions per whale"
echo "  - Rate Limit: 200ms between API calls"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# Run the TypeScript script with ts-node
npx ts-node compare_parsers_batch.ts

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                         Comparison Complete                                ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
