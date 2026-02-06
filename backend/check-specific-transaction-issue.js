/**
 * Check specific transaction for issues
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkTransaction() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');

    const signature = '5ReBLmBVSqXbyQyTr2ag1yco7q4UwVcxZe52QQVrY6WBASZSne2udLkTvmVinZnkGZDVouh9HH9i8bmyezkemzhc';

    console.log(`📊 Checking transaction: ${signature}\n`);

    const transactions = await whaleCollection.find({ signature }).toArray();

    console.log(`Found ${transactions.length} record(s) for this signature\n`);

    if (transactions.length === 0) {
      console.log('❌ Transaction not found in database');
      return;
    }

    transactions.forEach((tx, i) => {
      console.log(`\n═══════════════════════════════════════════════════════`);
      console.log(`Record ${i + 1}:`);
      console.log(`═══════════════════════════════════════════════════════`);
      console.log(`Type: ${tx.type}`);
      console.log(`Whale Address: ${tx.whaleAddress}`);
      console.log(`TokenIn: ${tx.tokenInSymbol} (${tx.tokenInAddress})`);
      console.log(`TokenOut: ${tx.tokenOutSymbol} (${tx.tokenOutAddress})`);
      console.log(`Classification Source: ${tx.classificationSource || 'N/A'}`);
      console.log(`Timestamp: ${new Date(tx.timestamp).toISOString()}`);
      
      console.log(`\nAmounts:`);
      console.log(`  Buy Amount: ${tx.amount?.buyAmount}`);
      console.log(`  Sell Amount: ${tx.amount?.sellAmount}`);
      console.log(`  Buy Token Amount: ${tx.tokenAmount?.buyTokenAmount}`);
      console.log(`  Sell Token Amount: ${tx.tokenAmount?.sellTokenAmount}`);
      
      console.log(`\nSOL Amounts:`);
      console.log(`  Buy SOL Amount: ${tx.solAmount?.buySolAmount}`);
      console.log(`  Sell SOL Amount: ${tx.solAmount?.sellSolAmount}`);
      
      console.log(`\nTransaction Object:`);
      console.log(`  TokenIn Amount: ${tx.transaction?.tokenIn?.amount}`);
      console.log(`  TokenOut Amount: ${tx.transaction?.tokenOut?.amount}`);
      console.log(`  TokenIn USD: ${tx.transaction?.tokenIn?.usdAmount}`);
      console.log(`  TokenOut USD: ${tx.transaction?.tokenOut?.usdAmount}`);
    });

    console.log(`\n\n📋 ANALYSIS:`);
    
    // Check if it should be split
    const tx = transactions[0];
    const tokenInIsCore = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS'].includes(tx.tokenInSymbol?.toUpperCase());
    const tokenOutIsCore = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS'].includes(tx.tokenOutSymbol?.toUpperCase());
    
    console.log(`\nToken Classification:`);
    console.log(`  TokenIn (${tx.tokenInSymbol}): ${tokenInIsCore ? 'CORE' : 'NON-CORE'}`);
    console.log(`  TokenOut (${tx.tokenOutSymbol}): ${tokenOutIsCore ? 'CORE' : 'NON-CORE'}`);
    
    if (!tokenInIsCore && !tokenOutIsCore) {
      console.log(`\n❌ ISSUE: Both tokens are NON-CORE`);
      console.log(`   Expected: 2 records (SELL + BUY)`);
      console.log(`   Actual: ${transactions.length} record(s)`);
      console.log(`   Status: ${transactions.length === 2 ? '✅ CORRECT' : '❌ WRONG - Should be split!'}`);
    } else {
      console.log(`\n✅ One token is CORE - single transaction is correct`);
    }
    
    // Check for Infinity values
    const hasInfinity = 
      tx.solAmount?.buySolAmount === Infinity ||
      tx.solAmount?.sellSolAmount === Infinity ||
      tx.amount?.buyAmount === Infinity ||
      tx.amount?.sellAmount === Infinity;
    
    if (hasInfinity) {
      console.log(`\n❌ ISSUE: Infinity values detected!`);
      console.log(`   This indicates a division by zero or invalid calculation`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkTransaction();
