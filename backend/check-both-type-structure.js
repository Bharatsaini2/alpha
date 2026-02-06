const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI'];

async function checkBothTypeStructure() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('whalealltransactionv2');
    
    // Get a sample "both" type transaction
    const sample = await collection.findOne({
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS }
    });
    
    if (!sample) {
      console.log('No "both" type transactions found');
      return;
    }
    
    console.log('Sample "both" type transaction:\n');
    console.log('Signature:', sample.signature);
    console.log('Type:', sample.type);
    console.log('Tokens:', sample.tokenInSymbol, '→', sample.tokenOutSymbol);
    console.log('\nbothType array:', JSON.stringify(sample.bothType, null, 2));
    console.log('\namount object:', JSON.stringify(sample.amount, null, 2));
    console.log('\ntokenAmount object:', JSON.stringify(sample.tokenAmount, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkBothTypeStructure();
