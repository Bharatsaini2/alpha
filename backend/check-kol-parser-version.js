/**
 * Check KOL Parser Version Usage
 * 
 * This script checks which parser version KOL transactions are using
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkKolParserVersion() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const kolCollection = db.collection('influencerwhaletransactionsv2');

    // Check parser version distribution
    console.log('📊 Checking parser version distribution...\n');

    const parserVersions = await kolCollection.aggregate([
      {
        $group: {
          _id: '$parserVersion',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    console.log('Parser Version Distribution:');
    parserVersions.forEach(v => {
      console.log(`  ${v._id || 'undefined'}: ${v.count} transactions`);
    });

    // Check classification source distribution
    console.log('\n📊 Checking classification source distribution...\n');

    const classificationSources = await kolCollection.aggregate([
      {
        $group: {
          _id: '$classificationSource',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    console.log('Classification Source Distribution:');
    classificationSources.forEach(s => {
      console.log(`  ${s._id || 'undefined'}: ${s.count} transactions`);
    });

    // Check recent transactions (last 24 hours)
    console.log('\n📊 Checking recent transactions (last 24 hours)...\n');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentTxs = await kolCollection.find({
      timestamp: { $gte: oneDayAgo }
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();

    console.log(`Found ${recentTxs.length} recent transactions\n`);

    if (recentTxs.length > 0) {
      console.log('Sample recent transactions:\n');
      
      recentTxs.slice(0, 5).forEach((tx, index) => {
        console.log(`${index + 1}. Signature: ${tx.signature?.substring(0, 16)}...`);
        console.log(`   Parser Version: ${tx.parserVersion || 'undefined'}`);
        console.log(`   Classification: ${tx.classificationSource || 'undefined'}`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   Token In: ${tx.tokenInSymbol}`);
        console.log(`   Token Out: ${tx.tokenOutSymbol}`);
        console.log(`   Timestamp: ${new Date(tx.timestamp).toISOString()}\n`);
      });
    }

    // Check for "both" type transactions
    console.log('📊 Checking "both" type transactions...\n');

    const bothTypeTxs = await kolCollection.find({
      type: 'both'
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();

    console.log(`Found ${bothTypeTxs.length} "both" type transactions (showing first 5):\n`);

    bothTypeTxs.forEach((tx, index) => {
      console.log(`${index + 1}. Signature: ${tx.signature?.substring(0, 16)}...`);
      console.log(`   Parser Version: ${tx.parserVersion || 'undefined'}`);
      console.log(`   Classification: ${tx.classificationSource || 'undefined'}`);
      console.log(`   Token In: ${tx.tokenInSymbol} (${tx.tokenInAddress?.substring(0, 8)}...)`);
      console.log(`   Token Out: ${tx.tokenOutSymbol} (${tx.tokenOutAddress?.substring(0, 8)}...)`);
      console.log(`   bothType: ${JSON.stringify(tx.bothType)}`);
      console.log(`   Timestamp: ${new Date(tx.timestamp).toISOString()}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkKolParserVersion();
