const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkTransactionStructure() {
  console.log('🔍 Checking Transaction Structure...\n');
  
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('alpha-whale-tracker');
  
  // Get a recent transaction to see its structure
  console.log('📊 Recent Whale Transaction Structure:');
  const recentTx = await db.collection('whalealltransactionv2')
    .findOne({}, { sort: { timestamp: -1 } });
    
  if (recentTx) {
    console.log('Full transaction structure:');
    console.log(JSON.stringify(recentTx, null, 2));
  } else {
    console.log('No transactions found');
  }
  
  // Check KOL transactions too
  console.log('\n📊 Recent KOL Transaction Structure:');
  const recentKolTx = await db.collection('influencerwhaletransactionsv2')
    .findOne({}, { sort: { timestamp: -1 } });
    
  if (recentKolTx) {
    console.log('Full KOL transaction structure:');
    console.log(JSON.stringify(recentKolTx, null, 2));
  } else {
    console.log('No KOL transactions found');
  }
  
  await client.close();
  console.log('\n✅ Structure check complete!');
}

checkTransactionStructure().catch(console.error);