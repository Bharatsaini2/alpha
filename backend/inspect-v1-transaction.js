require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function inspectTransaction() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    const startTime = new Date('2026-02-01T14:28:16.642Z');
    const endTime = new Date('2026-02-01T14:33:16.647Z');
    
    // Get one V1 transaction
    const v1Tx = await db.collection('whalealltransactionv2').findOne({
      'transaction.timestamp': {
        $gte: startTime,
        $lte: endTime
      }
    });
    
    if (!v1Tx) {
      console.log('❌ No transaction found');
      return;
    }
    
    console.log('📊 V1 Transaction Structure:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(JSON.stringify(v1Tx, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

inspectTransaction();
