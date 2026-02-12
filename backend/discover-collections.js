/**
 * Collection Discovery Script
 * 
 * This script helps identify the correct collection name in your MongoDB database
 * before running the full audit.
 * 
 * Run with: node discover-collections.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function discoverCollections() {
  console.log('\n=== MongoDB Collection Discovery ===\n');
  
  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected successfully\n');
    
    const db = mongoose.connection.db;
    console.log(`Database: ${db.databaseName}\n`);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:\n`);
    
    // Display all collections
    collections.forEach((col, index) => {
      console.log(`${index + 1}. ${col.name}`);
    });
    
    // Look for whale/transaction related collections
    console.log('\n--- Whale/Transaction Related Collections ---\n');
    const relevantCollections = collections.filter(c => 
      c.name.toLowerCase().includes('whale') || 
      c.name.toLowerCase().includes('transaction')
    );
    
    if (relevantCollections.length === 0) {
      console.log('No whale or transaction collections found.');
      console.log('\nThe Split Swap Architecture Fix requires a whale transactions collection.');
      console.log('Please verify:');
      console.log('1. You are connected to the correct database');
      console.log('2. The application has created transaction records');
      console.log('3. The collection name in the audit script matches your schema\n');
    } else {
      relevantCollections.forEach(col => {
        console.log(`✓ ${col.name}`);
      });
      
      // Check each relevant collection for split swap records
      console.log('\n--- Checking for Split Swap Records ---\n');
      
      for (const col of relevantCollections) {
        const collection = db.collection(col.name);
        
        // Count total documents
        const totalCount = await collection.countDocuments();
        console.log(`${col.name}:`);
        console.log(`  Total documents: ${totalCount}`);
        
        if (totalCount > 0) {
          // Check for split swap records
          const splitSwapCount = await collection.countDocuments({
            classificationSource: { $regex: /v2_parser_split/ }
          });
          console.log(`  Split swap records: ${splitSwapCount}`);
          
          // Check for type="both" records
          const bothCount = await collection.countDocuments({ type: 'both' });
          console.log(`  Type="both" records: ${bothCount}`);
          
          // Check for type="sell" records
          const sellCount = await collection.countDocuments({ type: 'sell' });
          console.log(`  Type="sell" records: ${sellCount}`);
          
          // Check for type="buy" records
          const buyCount = await collection.countDocuments({ type: 'buy' });
          console.log(`  Type="buy" records: ${buyCount}`);
          
          // Sample a document to show structure
          const sample = await collection.findOne({});
          if (sample) {
            console.log(`  Sample document fields:`);
            console.log(`    - signature: ${sample.signature ? 'present' : 'missing'}`);
            console.log(`    - type: ${sample.type || 'missing'}`);
            console.log(`    - classificationSource: ${sample.classificationSource || 'missing'}`);
            console.log(`    - amount: ${sample.amount ? 'present' : 'missing'}`);
            console.log(`    - solAmount: ${sample.solAmount ? 'present' : 'missing'}`);
          }
        }
        console.log('');
      }
    }
    
    // Recommendation
    console.log('\n--- Recommendation ---\n');
    if (relevantCollections.length === 0) {
      console.log('⚠ No whale transaction collections found.');
      console.log('The audit cannot proceed without transaction data.');
      console.log('\nPossible reasons:');
      console.log('1. Wrong database connection string');
      console.log('2. Application not yet deployed/running');
      console.log('3. No transactions have been processed yet');
    } else if (relevantCollections.length === 1) {
      const colName = relevantCollections[0].name;
      console.log(`✓ Use collection: "${colName}"`);
      console.log(`\nUpdate audit script if needed:`);
      console.log(`  const collection = db.collection('${colName}');`);
    } else {
      console.log('Multiple whale/transaction collections found.');
      console.log('Review the counts above to identify the correct collection.');
      console.log('\nLikely candidates:');
      relevantCollections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
    }
    
    console.log('\n=====================================\n');
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('\nPlease check:');
    console.error('1. MONGO_URI in .env file is correct');
    console.error('2. MongoDB server is running and accessible');
    console.error('3. Network connectivity to database\n');
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.\n');
  }
}

// Run discovery
discoverCollections().catch(console.error);
