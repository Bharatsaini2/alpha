// Check the transaction with wrong amounts
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'alpha-whale-tracker';

async function checkWrongAmountTransaction() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('whalealltransactionv2');
    
    // Check the specific transaction with wrong amounts
    const signature = '3oo9ddd75eW7uMDWGVmLcgPZhvU5PtbcfCw4eTBogBDTpEgHCEgFaJKfNrhyL34VJ5bBoJxQM1Tjx41YTyvpVUfr';
    
    console.log('\n🔍 Looking for transaction with wrong amounts...');
    console.log(`Signature: ${signature}`);
    
    const transactions = await collection.find({ signature }).toArray();
    
    console.log(`\nFound ${transactions.length} record(s):`);
    
    transactions.forEach((tx, i) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Record ${i + 1}:`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Type: ${tx.type}`);
      console.log(`Classification: ${tx.classification}`);
      console.log(`Confidence: ${tx.confidence}`);
      console.log(`\nToken Flow:`);
      console.log(`  IN:  ${tx.tokenInSymbol} (${tx.tokenInAmount})`);
      console.log(`       Address: ${tx.tokenInAddress}`);
      console.log(`       USD: $${tx.tokenInUsdAmount?.toFixed(2)}`);
      console.log(`  OUT: ${tx.tokenOutSymbol} (${tx.tokenOutAmount})`);
      console.log(`       Address: ${tx.tokenOutAddress}`);
      console.log(`       USD: $${tx.tokenOutUsdAmount?.toFixed(2)}`);
      console.log(`\nPrices:`);
      console.log(`  ${tx.tokenInSymbol} price: $${tx.tokenInPrice}`);
      console.log(`  ${tx.tokenOutSymbol} price: $${tx.tokenOutPrice}`);
      console.log(`\nSOL Amounts:`);
      console.log(`  Buy SOL: ${tx.solAmount?.buySolAmount}`);
      console.log(`  Sell SOL: ${tx.solAmount?.sellSolAmount}`);
      console.log(`\nPlatform: ${tx.platform}`);
      console.log(`Timestamp: ${tx.timestamp}`);
    });
    
    // According to Solscan, this transaction should be:
    // WSOL → LORIA (multi-hop through USDC)
    // Input: ~5 WSOL ($409)
    // Output: 65,451 LORIA ($21.28)
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('EXPECTED (from Solscan):');
    console.log(`${'='.repeat(80)}`);
    console.log('Main swap: WSOL → LORIA');
    console.log('Input: ~5 WSOL ($409)');
    console.log('Output: 65,451 LORIA ($21.28)');
    console.log('Multi-hop route through USDC');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkWrongAmountTransaction();
