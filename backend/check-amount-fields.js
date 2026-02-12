/**
 * Check what's actually in the amount fields
 * Run: node check-amount-fields.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkAmountFields() {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CHECKING AMOUNT FIELDS IN TRANSACTIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Get recent transactions
    const transactions = await db.collection('whalealltransactionv2')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    console.log(`Found ${transactions.length} recent transactions\n`);
    
    transactions.forEach((tx, index) => {
      console.log(`${index + 1}. Transaction ${tx.signature.substring(0, 20)}...`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log('');
      console.log('   📦 amount object:');
      console.log(`      buyAmount: ${tx.amount?.buyAmount}`);
      console.log(`      sellAmount: ${tx.amount?.sellAmount}`);
      console.log('');
      console.log('   🪙 tokenAmount object:');
      console.log(`      buyTokenAmount: ${tx.tokenAmount?.buyTokenAmount}`);
      console.log(`      sellTokenAmount: ${tx.tokenAmount?.sellTokenAmount}`);
      console.log('');
      console.log('   💰 transaction.tokenIn:');
      console.log(`      symbol: ${tx.transaction?.tokenIn?.symbol}`);
      console.log(`      amount: ${tx.transaction?.tokenIn?.amount}`);
      console.log(`      usdAmount: ${tx.transaction?.tokenIn?.usdAmount}`);
      console.log('');
      console.log('   💰 transaction.tokenOut:');
      console.log(`      symbol: ${tx.transaction?.tokenOut?.symbol}`);
      console.log(`      amount: ${tx.transaction?.tokenOut?.amount}`);
      console.log(`      usdAmount: ${tx.transaction?.tokenOut?.usdAmount}`);
      console.log('');
      console.log('   🔍 Analysis:');
      
      if (tx.type === 'buy') {
        const buyAmount = parseFloat(tx.amount?.buyAmount || '0');
        const tokenOutUsd = parseFloat(tx.transaction?.tokenOut?.usdAmount || '0');
        const tokenOutAmount = parseFloat(tx.transaction?.tokenOut?.amount || '0');
        
        console.log(`      amount.buyAmount (${buyAmount}) should equal transaction.tokenOut.usdAmount (${tokenOutUsd})`);
        console.log(`      Match: ${Math.abs(buyAmount - tokenOutUsd) < 0.01 ? '✅ YES' : '❌ NO'}`);
        console.log(`      Token amount: ${tokenOutAmount} ${tx.transaction?.tokenOut?.symbol}`);
      } else if (tx.type === 'sell') {
        const sellAmount = parseFloat(tx.amount?.sellAmount || '0');
        const tokenInUsd = parseFloat(tx.transaction?.tokenIn?.usdAmount || '0');
        const tokenInAmount = parseFloat(tx.transaction?.tokenIn?.amount || '0');
        
        console.log(`      amount.sellAmount (${sellAmount}) should equal transaction.tokenIn.usdAmount (${tokenInUsd})`);
        console.log(`      Match: ${Math.abs(sellAmount - tokenInUsd) < 0.01 ? '✅ YES' : '❌ NO'}`);
        console.log(`      Token amount: ${tokenInAmount} ${tx.transaction?.tokenIn?.symbol}`);
      }
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║   Check Amount Fields Diagnostic       ║');
console.log('╚════════════════════════════════════════╝');

checkAmountFields();
