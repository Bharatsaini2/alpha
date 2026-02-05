/**
 * Check Specific Transaction
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkTransaction() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');
    
    const signature = process.argv[2] || '5ReBLmBVSqXbyQyTr2ag1yco7q4UwVcxZe52QQVrY6WBASZSne2udLkTvmVinZnkGZDVouh9HH9i8bmyezkemzhc';
    
    console.log(`🔍 Checking transaction: ${signature}\n`);
    
    const transactions = await whaleCollection.find({ signature }).toArray();
    
    console.log(`Found ${transactions.length} record(s) for this signature\n`);
    
    transactions.forEach((tx, i) => {
      console.log(`Record ${i + 1}:`);
      console.log(`  Type: ${tx.type}`);
      console.log(`  Whale: ${tx.whaleAddress}`);
      console.log(`  TokenIn: ${tx.tokenInSymbol} (${tx.tokenInAddress?.substring(0, 20)}...)`);
      console.log(`  TokenOut: ${tx.tokenOutSymbol} (${tx.tokenOutAddress?.substring(0, 20)}...)`);
      console.log(`  Timestamp: ${new Date(tx.timestamp).toISOString()}`);
      console.log(`  Classification: ${tx.classificationSource || 'unknown'}`);
      console.log('');
    });
    
    // Check if this is an old transaction (before deployment)
    const deploymentTime = new Date('2026-02-05T12:00:00Z'); // Approximate deployment time
    const txTime = transactions[0] ? new Date(transactions[0].timestamp) : null;
    
    if (txTime && txTime < deploymentTime) {
      console.log('⚠️  This is an OLD transaction (before fix was deployed)');
      console.log('The fix only applies to NEW transactions after deployment.');
      console.log('\nTo fix old transactions, run the migration script:');
      console.log('  node migrate-old-transactions.js');
    } else {
      console.log('✅ This is a NEW transaction (after fix was deployed)');
      console.log('If it\'s still wrong, the fix may not be working correctly.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkTransaction();
