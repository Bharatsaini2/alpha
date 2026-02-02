/**
 * List Unknown Tokens from Database
 * 
 * This script:
 * 1. Finds all transactions with "Unknown" tokens
 * 2. Lists unique token addresses
 * 3. Checks if they're in CoinGecko
 * 4. Exports to CSV for manual checking
 * 
 * Usage: node list-unknown-tokens.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function listUnknownTokens() {
  console.log('\n');
  log('magenta', '╔════════════════════════════════════════════════════════════════════╗');
  log('magenta', '║   List Unknown Tokens from Database                               ║');
  log('magenta', '╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    log('green', '✅ Connected to MongoDB\n');

    const whaleAllTransactionModelV2 = require('./dist/models/whaleAllTransactionsV2.model').default;
    const influencerWhaleTransactionsModelV2 = require('./dist/models/influencerWhaleTransactionsV2.model').default;
    const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

    log('cyan', '🔍 Searching for transactions with "Unknown" token symbols...\n');

    // Find all transactions with Unknown tokens
    const whaleTransactions = await whaleAllTransactionModelV2
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    const influencerTransactions = await influencerWhaleTransactionsModelV2
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    const allTransactions = [...whaleTransactions, ...influencerTransactions];
    log('cyan', `Found ${allTransactions.length} transactions with "Unknown" tokens\n`);

    // Extract unique token addresses
    const unknownTokens = new Map();

    for (const tx of allTransactions) {
      // Check tokenIn
      if (tx.transaction?.tokenIn || tx.tokenInAddress) {
        const symbol = tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol;
        const address = tx.transaction?.tokenIn?.address || tx.tokenInAddress;
        
        if (symbol === 'Unknown' && address && !unknownTokens.has(address)) {
          unknownTokens.set(address, {
            address,
            firstSeen: tx.timestamp,
            txSignature: tx.signature,
            type: 'tokenIn'
          });
        }
      }

      // Check tokenOut
      if (tx.transaction?.tokenOut || tx.tokenOutAddress) {
        const symbol = tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol;
        const address = tx.transaction?.tokenOut?.address || tx.tokenOutAddress;
        
        if (symbol === 'Unknown' && address && !unknownTokens.has(address)) {
          unknownTokens.set(address, {
            address,
            firstSeen: tx.timestamp,
            txSignature: tx.signature,
            type: 'tokenOut'
          });
        }
      }
    }

    log('cyan', `Found ${unknownTokens.size} unique "Unknown" token addresses\n`);

    // Check each token
    log('yellow', '🔍 Checking each token in CoinGecko...\n');

    const results = [];
    let checkedCount = 0;

    for (const [address, info] of unknownTokens) {
      checkedCount++;
      
      if (checkedCount % 10 === 0) {
        log('cyan', `Checked ${checkedCount}/${unknownTokens.size} tokens...`);
      }

      try {
        const metadata = await getTokenMetaDataUsingRPC(address);
        
        const result = {
          address,
          symbol: metadata.symbol || 'Unknown',
          name: metadata.name || 'Unknown',
          firstSeen: info.firstSeen,
          txSignature: info.txSignature,
          inCoinGecko: metadata.symbol && !metadata.symbol.includes('...'),
          dexscreenerUrl: `https://dexscreener.com/solana/${address}`,
          solscanUrl: `https://solscan.io/token/${address}`,
          birdeyeUrl: `https://birdeye.so/token/${address}?chain=solana`
        };

        results.push(result);

        // Wait to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          address,
          symbol: 'Error',
          name: error.message,
          firstSeen: info.firstSeen,
          txSignature: info.txSignature,
          inCoinGecko: false,
          dexscreenerUrl: `https://dexscreener.com/solana/${address}`,
          solscanUrl: `https://solscan.io/token/${address}`,
          birdeyeUrl: `https://birdeye.so/token/${address}?chain=solana`
        });
      }
    }

    // Sort by whether they're in CoinGecko
    results.sort((a, b) => {
      if (a.inCoinGecko && !b.inCoinGecko) return -1;
      if (!a.inCoinGecko && b.inCoinGecko) return 1;
      return 0;
    });

    // Display results
    log('blue', `\n${'='.repeat(70)}`);
    log('blue', 'Results');
    log('blue', '='.repeat(70));

    const inCoinGecko = results.filter(r => r.inCoinGecko).length;
    const notInCoinGecko = results.filter(r => !r.inCoinGecko).length;

    log('cyan', `\n📊 Summary:`);
    log('green', `   ✅ In CoinGecko: ${inCoinGecko}`);
    log('red', `   ❌ Not in CoinGecko: ${notInCoinGecko}`);

    // Show tokens IN CoinGecko
    if (inCoinGecko > 0) {
      log('green', `\n✅ Tokens Found in CoinGecko (${inCoinGecko}):\n`);
      
      results.filter(r => r.inCoinGecko).slice(0, 20).forEach((token, index) => {
        log('green', `${index + 1}. ${token.symbol} (${token.name})`);
        log('cyan', `   Address: ${token.address}`);
        log('cyan', `   First Seen: ${token.firstSeen}`);
        log('cyan', `   DexScreener: ${token.dexscreenerUrl}`);
        console.log('');
      });
    }

    // Show tokens NOT in CoinGecko
    if (notInCoinGecko > 0) {
      log('red', `\n❌ Tokens NOT in CoinGecko (${notInCoinGecko}):\n`);
      log('yellow', '   These are likely brand new pump.fun tokens\n');
      
      results.filter(r => !r.inCoinGecko).slice(0, 20).forEach((token, index) => {
        log('red', `${index + 1}. ${token.address.slice(0, 8)}...${token.address.slice(-8)}`);
        log('cyan', `   Full Address: ${token.address}`);
        log('cyan', `   First Seen: ${token.firstSeen}`);
        log('cyan', `   Check on DexScreener: ${token.dexscreenerUrl}`);
        log('cyan', `   Check on Solscan: ${token.solscanUrl}`);
        log('cyan', `   Check on Birdeye: ${token.birdeyeUrl}`);
        console.log('');
      });
    }

    // Export to CSV
    const csvContent = [
      'Address,Symbol,Name,In CoinGecko,First Seen,TX Signature,DexScreener URL,Solscan URL,Birdeye URL',
      ...results.map(r => 
        `"${r.address}","${r.symbol}","${r.name}",${r.inCoinGecko},"${r.firstSeen}","${r.txSignature}","${r.dexscreenerUrl}","${r.solscanUrl}","${r.birdeyeUrl}"`
      )
    ].join('\n');

    fs.writeFileSync('unknown-tokens.csv', csvContent);
    log('green', '\n✅ Exported to unknown-tokens.csv');

    // Export NOT in CoinGecko to separate file
    const notInCoinGeckoTokens = results.filter(r => !r.inCoinGecko);
    const notInCoinGeckoCsv = [
      'Address,First Seen,TX Signature,DexScreener URL,Solscan URL,Birdeye URL',
      ...notInCoinGeckoTokens.map(r => 
        `"${r.address}","${r.firstSeen}","${r.txSignature}","${r.dexscreenerUrl}","${r.solscanUrl}","${r.birdeyeUrl}"`
      )
    ].join('\n');

    fs.writeFileSync('tokens-not-in-coingecko.csv', notInCoinGeckoCsv);
    log('green', '✅ Exported tokens not in CoinGecko to tokens-not-in-coingecko.csv\n');

    log('cyan', '\n💡 Next Steps:');
    log('cyan', '   1. Open tokens-not-in-coingecko.csv');
    log('cyan', '   2. Click on DexScreener/Solscan/Birdeye URLs to check each token');
    log('cyan', '   3. Most will be brand new pump.fun tokens (normal)');
    log('cyan', '   4. They will get listed on CoinGecko eventually (if they gain traction)');
    log('cyan', '   5. Until then, system will show shortened address (e.g., "44BF...pump")');

    await mongoose.disconnect();
    log('green', '\n✅ Disconnected from MongoDB\n');

  } catch (error) {
    log('red', `\n❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
listUnknownTokens();
