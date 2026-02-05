/**
 * Check Split Swap Issue
 * 
 * Investigates why some split swaps are inverted and why some non-core to non-core
 * transactions are not being split into two transactions.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alpha-tracker';

// Transaction model schema - check both possible collection names
const transactionSchema = new mongoose.Schema({
  signature: String,
  swapper: String,
  type: String,
  timestamp: Date,
  transaction: {
    tokenIn: {
      symbol: String,
      address: String,
      amount: Number,
      decimals: Number
    },
    tokenOut: {
      symbol: String,
      address: String,
      amount: Number,
      decimals: Number
    },
    amountIn: Number,
    amountOut: Number,
    solAmount: Number,
    usdValue: Number
  },
  protocol: String,
  confidence: Number
}, { strict: false });

// Try to find the correct collection
let Transaction;

// Core tokens list (30 tokens)
const CORE_TOKENS = new Set([
  'So11111111111111111111111111111111111111112', // SOL
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
  'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD', // JupUSD
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT', // UXD
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC
  'star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM', // USD*
  'USX6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX
  'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH', // CASH
  'hyUSD5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', // hyUSD
  'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUjY', // syrupUSDC
  'Sj14XLJZSVMcUYpAfajdZRpnfHUpJieZHS4aPektLWvh', // SjlUSD
  'G9fvHrYNw1A8Evpcj7X2yy4k4fT7nNHcA9L6UsamNHAif', // GjlUSD
  '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', // jlUSDC
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', // JLP
  'JUICED7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk', // JUICED
  'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg', // zBTC
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // wBTC
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // wETH
]);

function isCoreToken(address) {
  return CORE_TOKENS.has(address);
}

async function checkTransaction(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Checking transaction: ${signature}`);
  console.log('='.repeat(80));
  
  const txs = await Transaction.find({ signature }).sort({ timestamp: -1 });
  
  if (txs.length === 0) {
    console.log('❌ Transaction not found in database');
    return null;
  }
  
  console.log(`\n📊 Found ${txs.length} record(s) for this signature`);
  
  txs.forEach((tx, index) => {
    console.log(`\n--- Record ${index + 1} ---`);
    console.log(`Type: ${tx.type}`);
    console.log(`Timestamp: ${tx.timestamp}`);
    console.log(`Protocol: ${tx.protocol || 'unknown'}`);
    console.log(`Confidence: ${tx.confidence || 'N/A'}`);
    
    if (tx.transaction) {
      console.log(`\nToken Flow:`);
      console.log(`  IN:  ${tx.transaction.tokenIn?.symbol || 'unknown'} (${tx.transaction.tokenIn?.address?.substring(0, 8)}...)`);
      console.log(`       Amount: ${tx.transaction.tokenIn?.amount || tx.transaction.amountIn || 'N/A'}`);
      console.log(`       Core Token: ${isCoreToken(tx.transaction.tokenIn?.address) ? '✅ YES' : '❌ NO'}`);
      
      console.log(`  OUT: ${tx.transaction.tokenOut?.symbol || 'unknown'} (${tx.transaction.tokenOut?.address?.substring(0, 8)}...)`);
      console.log(`       Amount: ${tx.transaction.tokenOut?.amount || tx.transaction.amountOut || 'N/A'}`);
      console.log(`       Core Token: ${isCoreToken(tx.transaction.tokenOut?.address) ? '✅ YES' : '❌ NO'}`);
      
      // Check if this should be a split swap
      const tokenInIsCore = isCoreToken(tx.transaction.tokenIn?.address);
      const tokenOutIsCore = isCoreToken(tx.transaction.tokenOut?.address);
      
      console.log(`\n🔍 Analysis:`);
      if (!tokenInIsCore && !tokenOutIsCore) {
        console.log(`  ⚠️  BOTH tokens are NON-CORE - Should be SPLIT into 2 transactions`);
        console.log(`  Expected: SELL ${tx.transaction.tokenIn?.symbol} + BUY ${tx.transaction.tokenOut?.symbol}`);
      } else if (tokenInIsCore && tokenOutIsCore) {
        console.log(`  ⚠️  BOTH tokens are CORE - Should be SUPPRESSED`);
      } else {
        console.log(`  ✅ One core, one non-core - Standard swap (correct)`);
      }
      
      // Check if direction is inverted
      if (tx.type === 'buy') {
        console.log(`  Type: BUY - User bought ${tx.transaction.tokenOut?.symbol} with ${tx.transaction.tokenIn?.symbol}`);
        if (!tokenInIsCore && tokenOutIsCore) {
          console.log(`  ⚠️  INVERTED: Buying core token with non-core token (unusual)`);
        }
      } else if (tx.type === 'sell') {
        console.log(`  Type: SELL - User sold ${tx.transaction.tokenIn?.symbol} for ${tx.transaction.tokenOut?.symbol}`);
        if (tokenInIsCore && !tokenOutIsCore) {
          console.log(`  ⚠️  INVERTED: Selling core token for non-core token (unusual)`);
        }
      }
    }
  });
  
  return txs;
}

async function checkRecentNonCoreToNonCore() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Checking recent non-core to non-core transactions');
  console.log('='.repeat(80));
  
  // Get recent transactions (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentTxs = await Transaction.find({
    timestamp: { $gte: oneDayAgo }
  }).sort({ timestamp: -1 }).limit(100);
  
  console.log(`\n📊 Analyzing ${recentTxs.length} recent transactions...`);
  
  const nonCoreToNonCore = [];
  const signatures = new Set();
  
  for (const tx of recentTxs) {
    if (!tx.transaction?.tokenIn?.address || !tx.transaction?.tokenOut?.address) {
      continue;
    }
    
    const tokenInIsCore = isCoreToken(tx.transaction.tokenIn.address);
    const tokenOutIsCore = isCoreToken(tx.transaction.tokenOut.address);
    
    if (!tokenInIsCore && !tokenOutIsCore) {
      // Check if this signature already has 2 records (properly split)
      const count = await Transaction.countDocuments({ signature: tx.signature });
      
      if (!signatures.has(tx.signature)) {
        signatures.add(tx.signature);
        nonCoreToNonCore.push({
          signature: tx.signature,
          recordCount: count,
          tokenIn: tx.transaction.tokenIn.symbol,
          tokenOut: tx.transaction.tokenOut.symbol,
          type: tx.type,
          timestamp: tx.timestamp
        });
      }
    }
  }
  
  console.log(`\n🔍 Found ${nonCoreToNonCore.length} non-core to non-core transactions:`);
  
  const properlySplit = nonCoreToNonCore.filter(tx => tx.recordCount === 2);
  const notSplit = nonCoreToNonCore.filter(tx => tx.recordCount === 1);
  
  console.log(`\n✅ Properly split (2 records): ${properlySplit.length}`);
  console.log(`❌ NOT split (1 record): ${notSplit.length}`);
  
  if (notSplit.length > 0) {
    console.log(`\n⚠️  Transactions that should be split but aren't:`);
    notSplit.slice(0, 10).forEach(tx => {
      console.log(`  - ${tx.signature.substring(0, 16)}... | ${tx.tokenIn} → ${tx.tokenOut} | ${tx.type}`);
    });
  }
  
  if (properlySplit.length > 0) {
    console.log(`\n✅ Properly split transactions (sample):`);
    properlySplit.slice(0, 5).forEach(tx => {
      console.log(`  - ${tx.signature.substring(0, 16)}... | ${tx.tokenIn} → ${tx.tokenOut}`);
    });
  }
  
  return { properlySplit, notSplit };
}

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // List all collections to find the correct one
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📋 Available collections:');
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    // Try different collection names
    const possibleNames = ['whalealltransactionv2', 'whaletransactionv2', 'whaletransactions', 'transactions'];
    let collectionName = null;
    
    for (const name of possibleNames) {
      const exists = collections.find(c => c.name === name);
      if (exists) {
        collectionName = name;
        console.log(`\n✅ Found collection: ${name}`);
        break;
      }
    }
    
    if (!collectionName) {
      console.log('\n❌ No transaction collection found');
      return;
    }
    
    // Create model with correct collection name
    Transaction = mongoose.model('Transaction', transactionSchema, collectionName);
    
    // Get total count
    const totalCount = await Transaction.countDocuments();
    console.log(`\n📊 Total transactions in ${collectionName}: ${totalCount}`);
    
    // Check specific transactions mentioned by user
    const specificSignatures = [
      'ew5bFmxwf6jHV3tQ7mcWDSTN9rE1DrherYC3YfbYxPKrh5ChMN4zmcEVPkuZGQLJbiwqT6kWBHR4X6EdPNbKrW7',
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      'SJh5MqfZiANqEqoNDFCE7GgHziSapekW4GWc3TmpNzSKQ5m38HgdRYdjb7CTy35asCtNNNMRxt7F9WsVPpzyRVb',
      '36R5jJJAfVmSt1uhkMgUgb3qHx4qsAkNXMh1Eo1dHHXXjxry3ofFDre1gpqxFzUXxehPiZ9tjwBajQcbw2E49VZ8',
      '5mB2YAC3TjAux9eRDegehoCRyjBVdWkTgqgAcRCDS8xayESqTfxD3xHQeo1bAquu7yyYtFAA7kQ1yamFrvZnezax'
    ];
    
    for (const sig of specificSignatures) {
      await checkTransaction(sig);
    }
    
    // Check recent non-core to non-core transactions
    await checkRecentNonCoreToNonCore();
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

main();
