/**
 * Database Collection Diagnostic Script
 * 
 * This script helps identify the correct collection names in your MongoDB database.
 * Run this first if the audit script fails with "collection not found" errors.
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function diagnoseCollections() {
  console.log('\n=== MongoDB Collection Diagnostic ===\n');
  
  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected successfully\n');
    
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log(`Database: ${dbName}\n`);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:\n`);
    
    // Display all collections with document counts
    for (const collection of collections) {
      const coll = db.collection(collection.name);
      const count = await coll.countDocuments();
      console.log(`  - ${collection.name} (${count.toLocaleString()} documents)`);
    }
    
    console.log('\n');
    
    // Look for whale transaction collections
    const whaleCollections = collections.filter(c => 
      c.name.toLowerCase().includes('whale') || 
      c.name.toLowerCase().includes('transaction')
    );
    
    if (whaleCollections.length > 0) {
      console.log('Whale/Transaction collections found:');
      for (const collection of whaleCollections) {
        const coll = db.collection(collection.name);
        const count = await coll.countDocuments();
        console.log(`\n  Collection: ${collection.name}`);
        console.log(`  Documents: ${count.toLocaleString()}`);
        
        // Get sample document
        const sample = await coll.findOne();
        if (sample) {
          console.log(`  Sample fields: ${Object.keys(sample).join(', ')}`);
          
          // Check for split swap indicators
          if (sample.classificationSource) {
            console.log(`  Classification Source: ${sample.classificationSource}`);
          }
          if (sample.type) {
            console.log(`  Type: ${sample.type}`);
          }
        }
      }
    } else {
      console.log('⚠ No whale or transaction collections found');
      console.log('This may indicate:');
      console.log('  1. No transactions have been processed yet');
      console.log('  2. Collections use different naming convention');
      console.log('  3. Wrong database connected');
    }
    
    // Check for split swap records
    console.log('\n\n=== Split Swap Record Check ===\n');
    
    for (const collection of whaleCollections) {
      const coll = db.collection(collection.name);
      
      // Check for v2_parser_split records
      const splitSwapCount = await coll.countDocuments({
        classificationSource: { $regex: /v2_parser_split/ }
      });
      
      if (splitSwapCount > 0) {
        console.log(`Collection: ${collection.name}`);
        console.log(`  Split swap records: ${splitSwapCount.toLocaleString()}`);
        
        // Check types
        const types = await coll.distinct('type', {
          classificationSource: { $regex: /v2_parser_split/ }
        });
        console.log(`  Types found: ${types.join(', ')}`);
        
        // Check classification sources
        const sources = await coll.distinct('classificationSource', {
          classificationSource: { $regex: /v2_parser_split/ }
        });
        console.log(`  Classification sources: ${sources.join(', ')}`);
        
        // Sample split swap record
        const sample = await coll.findOne({
          classificationSource: { $regex: /v2_parser_split/ }
        });
        
        if (sample) {
          console.log(`\n  Sample Split Swap Record:`);
          console.log(`    Signature: ${sample.signature?.substring(0, 16)}...`);
          console.log(`    Type: ${sample.type}`);
          console.log(`    Classification: ${sample.classificationSource}`);
          console.log(`    Sell Amount: ${sample.amount?.sellAmount}`);
          console.log(`    Buy Amount: ${sample.amount?.buyAmount}`);
          console.log(`    Sell SOL: ${sample.solAmount?.sellSolAmount}`);
          console.log(`    Buy SOL: ${sample.solAmount?.buySolAmount}`);
        }
        
        console.log('');
      }
    }
    
    // Recommendation
    console.log('\n=== Recommendation ===\n');
    
    if (whaleCollections.length === 0) {
      console.log('⚠ No whale transaction collections found.');
      console.log('Action: Verify database connection and ensure transactions have been processed.');
    } else if (whaleCollections.length === 1) {
      console.log(`✓ Use collection: ${whaleCollections[0].name}`);
      console.log(`Update audit script if needed to use this collection name.`);
    } else {
      console.log('Multiple whale transaction collections found:');
      whaleCollections.forEach(c => console.log(`  - ${c.name}`));
      console.log('\nAction: Determine which collection is currently active and update audit script.');
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed\n');
  }
}

diagnoseCollections().catch(console.error);
