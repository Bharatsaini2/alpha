/**
 * Check Split Swaps in Database
 * 
 * Query recent transactions where both tokens are non-core
 * to verify if they're being split into two records
 */

const mongoose = require('mongoose');
require('dotenv').config();

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

function isCoreToken(mint) {
  return CORE_TOKENS.has(mint);
}

// Transaction schema - using whaleAllTransactionV2 collection
const transactionSchema = new mongoose.Schema({
  signature: String,
  timestamp: Date,
  whaleAddress: String,
  type: String,
  transaction: {
    tokenIn: {
      address: String,
      symbol: String,
      amount: String,
    },
    tokenOut: {
      address: String,
      symbol: String,
      amount: String,
    },
  },
  whale: {
    address: String,
  },
}, { collection: 'whalealltransactionv2' }); // Correct collection name

const Transaction = mongoose.model('Transaction', transactionSchema);

async function checkSplitSwaps() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get recent transactions (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    console.log('📊 Querying recent transactions (last 7 days)...\n');
    const recentTransactions = await Transaction.find({
      timestamp: { $gte: sevenDaysAgo }
    })
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

    console.log(`Found ${recentTransactions.length} transactions in last 7 days\n`);

    // Analyze transactions
    const nonCoreToNonCore = [];
    const coreToNonCore = [];
    const coreToCore = [];
    const signatureGroups = {};

    for (const tx of recentTransactions) {
      const tokenInMint = tx.transaction?.tokenIn?.address;
      const tokenOutMint = tx.transaction?.tokenOut?.address;

      if (!tokenInMint || !tokenOutMint) continue;

      const tokenInIsCore = isCoreToken(tokenInMint);
      const tokenOutIsCore = isCoreToken(tokenOutMint);

      // Group by signature to detect splits
      if (!signatureGroups[tx.signature]) {
        signatureGroups[tx.signature] = [];
      }
      signatureGroups[tx.signature].push(tx);

      if (!tokenInIsCore && !tokenOutIsCore) {
        nonCoreToNonCore.push(tx);
      } else if (tokenInIsCore && tokenOutIsCore) {
        coreToCore.push(tx);
      } else {
        coreToNonCore.push(tx);
      }
    }

    // Check for split swaps (same signature, multiple records)
    const splitSwaps = Object.entries(signatureGroups)
      .filter(([sig, txs]) => txs.length > 1)
      .map(([sig, txs]) => ({ signature: sig, count: txs.length, transactions: txs }));

    console.log('=' .repeat(80));
    console.log('📈 TRANSACTION ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\n🔵 Core-to-NonCore: ${coreToNonCore.length} (should be 1 record each)`);
    console.log(`🟢 NonCore-to-NonCore: ${nonCoreToNonCore.length} (should be 2 records each - SPLIT)`);
    console.log(`🔴 Core-to-Core: ${coreToCore.length} (should be 0 - suppressed)`);
    console.log(`\n🔄 Split Swaps Found: ${splitSwaps.length} signatures with multiple records`);

    // Show non-core to non-core transactions
    if (nonCoreToNonCore.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('🟢 NON-CORE TO NON-CORE TRANSACTIONS (Should be split into 2 records)');
      console.log('='.repeat(80));

      // Group by signature
      const nonCoreBySig = {};
      for (const tx of nonCoreToNonCore) {
        if (!nonCoreBySig[tx.signature]) {
          nonCoreBySig[tx.signature] = [];
        }
        nonCoreBySig[tx.signature].push(tx);
      }

      for (const [sig, txs] of Object.entries(nonCoreBySig)) {
        console.log(`\n📝 Signature: ${sig.slice(0, 16)}...`);
        console.log(`   Records: ${txs.length} ${txs.length === 2 ? '✅ SPLIT CORRECTLY' : '❌ NOT SPLIT'}`);
        
        for (const tx of txs) {
          console.log(`   - Type: ${tx.type}`);
          console.log(`     TokenIn: ${tx.transaction?.tokenIn?.symbol || 'Unknown'} (${tx.transaction?.tokenIn?.address?.slice(0, 8)}...)`);
          console.log(`     TokenOut: ${tx.transaction?.tokenOut?.symbol || 'Unknown'} (${tx.transaction?.tokenOut?.address?.slice(0, 8)}...)`);
          console.log(`     Amount: ${tx.transaction?.tokenIn?.amount || 0} → ${tx.transaction?.tokenOut?.amount || 0}`);
          console.log(`     Timestamp: ${tx.timestamp}`);
        }
      }
    }

    // Show core-to-core transactions (should be 0)
    if (coreToCore.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('🔴 CORE-TO-CORE TRANSACTIONS (Should be suppressed - 0 records)');
      console.log('='.repeat(80));

      for (const tx of coreToCore.slice(0, 10)) {
        console.log(`\n❌ Signature: ${tx.signature.slice(0, 16)}...`);
        console.log(`   TokenIn: ${tx.transaction?.tokenIn?.symbol} (${tx.transaction?.tokenIn?.address?.slice(0, 8)}...)`);
        console.log(`   TokenOut: ${tx.transaction?.tokenOut?.symbol} (${tx.transaction?.tokenOut?.address?.slice(0, 8)}...)`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   Timestamp: ${tx.timestamp}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    
    const nonCoreSplitCorrectly = Object.values(
      nonCoreToNonCore.reduce((acc, tx) => {
        if (!acc[tx.signature]) acc[tx.signature] = [];
        acc[tx.signature].push(tx);
        return acc;
      }, {})
    ).filter(txs => txs.length === 2).length;

    const nonCoreTotalSignatures = Object.keys(
      nonCoreToNonCore.reduce((acc, tx) => {
        acc[tx.signature] = true;
        return acc;
      }, {})
    ).length;

    console.log(`\n✅ NonCore-to-NonCore split correctly: ${nonCoreSplitCorrectly}/${nonCoreTotalSignatures}`);
    console.log(`❌ NonCore-to-NonCore NOT split: ${nonCoreTotalSignatures - nonCoreSplitCorrectly}/${nonCoreTotalSignatures}`);
    console.log(`🔴 Core-to-Core in DB (should be 0): ${coreToCore.length}`);
    
    if (nonCoreTotalSignatures - nonCoreSplitCorrectly > 0) {
      console.log('\n⚠️  WARNING: Some non-core to non-core swaps are NOT being split!');
      console.log('   This indicates the split protocol is not working correctly.');
    } else if (nonCoreTotalSignatures > 0) {
      console.log('\n✅ All non-core to non-core swaps are being split correctly!');
    } else {
      console.log('\n⚠️  No non-core to non-core swaps found in last 24 hours.');
    }

    if (coreToCore.length > 0) {
      console.log('\n⚠️  WARNING: Core-to-core swaps found in database!');
      console.log('   These should have been suppressed by the parser.');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkSplitSwaps();
