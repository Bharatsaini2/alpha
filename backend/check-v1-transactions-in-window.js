require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkV1TransactionsInWindow() {
  const client = new MongoClient(process.env.MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('alpha-tracker');
    const whaleCollection = db.collection('whale_transactions');
    
    // Test window from the comparison report
    const startTime = new Date('2026-02-01T14:28:16.642Z');
    const endTime = new Date('2026-02-01T14:33:16.647Z');
    
    console.log('\n📊 Querying V1 transactions in test window:');
    console.log(`Start: ${startTime.toISOString()}`);
    console.log(`End: ${endTime.toISOString()}`);
    
    // Query transactions saved in the database during the test window
    const v1Transactions = await whaleCollection.find({
      timestamp: {
        $gte: startTime,
        $lte: endTime
      }
    }).sort({ timestamp: 1 }).toArray();
    
    console.log(`\n✅ Found ${v1Transactions.length} V1 transactions in database\n`);
    
    // V2 signatures from the comparison report
    const v2Signatures = [
      "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"
    ];
    
    const v2SignatureSet = new Set(v2Signatures);
    
    // Display V1 transactions and check overlap
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('V1 TRANSACTIONS (from database):');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    let matchCount = 0;
    const v1Signatures = [];
    
    v1Transactions.forEach((tx, index) => {
      const isInV2 = v2SignatureSet.has(tx.signature);
      const matchSymbol = isInV2 ? '✅ MATCH' : '❌ NOT IN V2';
      
      v1Signatures.push(tx.signature);
      
      console.log(`${index + 1}. ${matchSymbol}`);
      console.log(`   Signature: ${tx.signature}`);
      console.log(`   Timestamp: ${tx.timestamp.toISOString()}`);
      console.log(`   Side: ${tx.side}`);
      console.log(`   Wallet: ${tx.walletAddress}`);
      console.log(`   Token: ${tx.tokenSymbol || 'UNKNOWN'}`);
      console.log(`   Amount: ${tx.amount || 0}`);
      console.log('');
      
      if (isInV2) matchCount++;
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`V1 Total: ${v1Transactions.length}`);
    console.log(`V2 Total: ${v2Signatures.length}`);
    console.log(`Matches: ${matchCount}`);
    console.log(`V1 Only (V2 missed): ${v1Transactions.length - matchCount}`);
    console.log(`V2 Only (V2 extras): ${v2Signatures.length - matchCount}`);
    console.log('');
    
    if (matchCount === v1Transactions.length && matchCount < v2Signatures.length) {
      console.log('✅ SUCCESS: V2 has ALL V1 transactions PLUS extras!');
      console.log(`   V2 found ${v2Signatures.length - matchCount} additional transactions that V1 missed`);
    } else if (matchCount === v1Transactions.length) {
      console.log('⚠️  V2 has all V1 transactions but no extras');
    } else {
      console.log('❌ PROBLEM: V2 is missing some V1 transactions!');
      console.log('   This is a regression - V2 should find everything V1 finds');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkV1TransactionsInWindow();
