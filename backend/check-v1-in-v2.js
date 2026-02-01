require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function checkV1InV2() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Read the comparison report
    const report = require('./v1-v2-comparison-report.json');
    
    const startTime = new Date(report.testWindow.start);
    const endTime = new Date(report.testWindow.end);
    
    console.log('📊 Test Window:');
    console.log(`Start: ${startTime.toISOString()}`);
    console.log(`End: ${endTime.toISOString()}\n`);
    
    // Get V1 transactions from database (using the correct collection name)
    const v1Transactions = await db.collection('whalealltransactionv2').find({
      'transaction.timestamp': {
        $gte: startTime,
        $lte: endTime
      }
    }).toArray();
    
    console.log(`V1 Transactions in DB: ${v1Transactions.length}`);
    console.log(`V2 Transactions detected: ${report.v2.total}\n`);
    
    // Get V2 signatures
    const v2Signatures = new Set(report.v2.signatures);
    
    // Check each V1 transaction
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('CHECKING IF V1 TRANSACTIONS ARE IN V2:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    let foundInV2 = 0;
    let notFoundInV2 = 0;
    let nullSignatures = 0;
    
    for (const tx of v1Transactions) {
      const signature = tx.signature; // Signature is at root level, not in transaction object
      if (!signature) {
        nullSignatures++;
        console.log(`⚠️  NULL SIGNATURE in V1 transaction`);
        console.log(`   Timestamp: ${tx.transaction?.timestamp || tx.timestamp}`);
        console.log(`   Type: ${tx.type || 'N/A'}`);
        console.log('');
        continue;
      }
      
      const inV2 = v2Signatures.has(signature);
      
      if (inV2) {
        foundInV2++;
        console.log(`✅ FOUND: ${signature}`);
        console.log(`   Timestamp: ${tx.transaction?.timestamp || tx.timestamp}`);
        console.log(`   Type: ${tx.type || 'N/A'}`);
        console.log(`   Whale: ${tx.whale?.address?.substring(0, 8)}...`);
      } else {
        notFoundInV2++;
        console.log(`❌ NOT FOUND: ${signature}`);
        console.log(`   Timestamp: ${tx.transaction?.timestamp || tx.timestamp}`);
        console.log(`   Type: ${tx.type || 'N/A'}`);
        console.log(`   Whale: ${tx.whale?.address?.substring(0, 8)}...`);
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`V1 transactions in DB: ${v1Transactions.length}`);
    console.log(`V1 with null signatures: ${nullSignatures}`);
    console.log(`V1 found in V2: ${foundInV2}`);
    console.log(`V1 NOT found in V2: ${notFoundInV2}`);
    console.log(`V2 extras (not in V1): ${report.v2.total - foundInV2}`);
    console.log('');
    
    if (foundInV2 === v1Transactions.length - nullSignatures) {
      console.log('✅ SUCCESS: V2 detected ALL V1 transactions!');
    } else {
      console.log('⚠️  WARNING: V2 missed some V1 transactions!');
    }
    
    console.log(`\n📈 V2 found ${report.v2.total - foundInV2} additional transactions that V1 missed`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkV1InV2();
