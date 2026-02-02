// Check all token-related collections for recent activity
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkAllTokenCollections() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    
    // Check all token-related collections
    const tokenCollections = [
      'tokenmetadatacache',
      'tokenmetadatacaches', // plural version
      'tokendatas',
      'token_price_history'
    ];
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const collectionName of tokenCollections) {
      try {
        const collection = db.collection(collectionName);
        const totalCount = await collection.countDocuments();
        
        if (totalCount > 0) {
          console.log(`\n📊 ${collectionName}: ${totalCount} total documents`);
          
          // Check for recent activity
          const recentCount = await collection.countDocuments({
            $or: [
              { createdAt: { $gte: oneHourAgo } },
              { lastUpdated: { $gte: oneHourAgo } },
              { updatedAt: { $gte: oneHourAgo } }
            ]
          });
          
          if (recentCount > 0) {
            console.log(`  🆕 ${recentCount} recent entries (last hour)`);
            
            // Show sample recent entries
            const samples = await collection.find({
              $or: [
                { createdAt: { $gte: oneHourAgo } },
                { lastUpdated: { $gte: oneHourAgo } },
                { updatedAt: { $gte: oneHourAgo } }
              ]
            })
            .limit(5)
            .toArray();
            
            console.log('  📝 Sample recent entries:');
            samples.forEach((doc, i) => {
              if (doc.symbol || doc.tokenSymbol) {
                const symbol = doc.symbol || doc.tokenSymbol || 'N/A';
                const name = doc.name || doc.tokenName || 'N/A';
                const address = doc.tokenAddress || doc.address || 'N/A';
                console.log(`    ${i+1}. ${symbol} (${name}) - ${address.slice(0, 8)}...`);
              } else {
                console.log(`    ${i+1}. ${JSON.stringify(doc).substring(0, 100)}...`);
              }
            });
          } else {
            console.log(`  ⏰ No recent activity in last hour`);
          }
        }
      } catch (err) {
        console.log(`\n❌ ${collectionName}: Collection doesn't exist or error - ${err.message}`);
      }
    }
    
    // Check recent whale transactions to see if they have token metadata
    console.log('\n🐋 Checking recent whale transactions for token metadata...');
    try {
      const whaleCollection = db.collection('whalealltransactionv2');
      const recentWhales = await whaleCollection.find({
        createdAt: { $gte: oneHourAgo }
      })
      .limit(5)
      .toArray();
      
      console.log(`Found ${recentWhales.length} recent whale transactions`);
      recentWhales.forEach((tx, i) => {
        const inSymbol = tx.tokenInSymbol || tx.input?.symbol || 'Unknown';
        const outSymbol = tx.tokenOutSymbol || tx.output?.symbol || 'Unknown';
        console.log(`  ${i+1}. ${inSymbol} -> ${outSymbol}`);
      });
      
    } catch (err) {
      console.log(`❌ Error checking whale transactions: ${err.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkAllTokenCollections();