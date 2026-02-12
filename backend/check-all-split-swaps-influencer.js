require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

const influencerWhaleTransactionsV2Schema = new mongoose.Schema({
  signature: { type: String, required: true, index: true },
  type: { type: String, required: true },
  classificationSource: { type: String },
}, { timestamps: true });

const InfluencerWhaleTransactionsV2 = mongoose.model('influencerWhaleTransactionV2', influencerWhaleTransactionsV2Schema);

async function checkAllSplitSwapsInInfluencer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('🔍 SEARCHING FOR SPLIT SWAP TRANSACTIONS IN INFLUENCER MODEL');
    console.log('='.repeat(100) + '\n');
    
    // Method 1: Find records with classificationSource containing "split"
    console.log('METHOD 1: Search by classificationSource containing "split"');
    console.log('-'.repeat(100));
    
    const splitBySource = await InfluencerWhaleTransactionsV2.find({
      classificationSource: { $regex: /split/i }
    }).lean();
    
    console.log(`Found ${splitBySource.length} records with "split" in classificationSource\n`);
    
    if (splitBySource.length > 0) {
      console.log('Sample records:');
      splitBySource.slice(0, 5).forEach((record, idx) => {
        console.log(`\n${idx + 1}. Signature: ${record.signature}`);
        console.log(`   Type: ${record.type}`);
        console.log(`   Classification Source: ${record.classificationSource}`);
        console.log(`   Created At: ${record.createdAt}`);
      });
    }
    
    // Method 2: Find duplicate signatures (potential split swaps)
    console.log('\n' + '='.repeat(100));
    console.log('METHOD 2: Find duplicate signatures (same signature, different types)');
    console.log('-'.repeat(100) + '\n');
    
    const duplicateSignatures = await InfluencerWhaleTransactionsV2.aggregate([
      {
        $group: {
          _id: '$signature',
          count: { $sum: 1 },
          types: { $addToSet: '$type' },
          records: { $push: '$$ROOT' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    console.log(`Found ${duplicateSignatures.length} signatures with multiple records\n`);
    
    if (duplicateSignatures.length > 0) {
      console.log('Potential split swaps (same signature, multiple records):');
      duplicateSignatures.forEach((group, idx) => {
        console.log(`\n${idx + 1}. Signature: ${group._id}`);
        console.log(`   Count: ${group.count} records`);
        console.log(`   Types: ${group.types.join(', ')}`);
        
        // Check if it has both buy and sell
        const hasBuy = group.types.includes('buy');
        const hasSell = group.types.includes('sell');
        const hasBoth = group.types.includes('both');
        
        if (hasBuy && hasSell && !hasBoth) {
          console.log(`   ✅ CORRECT: Split swap with separate buy and sell records`);
        } else if (hasBoth) {
          console.log(`   ⚠️  Has "both" type - may need migration`);
        } else {
          console.log(`   ⚠️  Unexpected pattern`);
        }
        
        // Show details of each record
        group.records.forEach((record, recIdx) => {
          console.log(`\n   Record ${recIdx + 1}:`);
          console.log(`      Type: ${record.type}`);
          console.log(`      Classification Source: ${record.classificationSource || 'N/A'}`);
          console.log(`      Created At: ${record.createdAt}`);
        });
      });
    } else {
      console.log('✅ No duplicate signatures found');
      console.log('   This means either:');
      console.log('   1. No split swaps have been processed for influencers yet');
      console.log('   2. Split swaps are being stored as single "both" records (old behavior)');
    }
    
    // Method 3: Check for "both" type records (old split swap storage)
    console.log('\n' + '='.repeat(100));
    console.log('METHOD 3: Check for "both" type records (potential old split swaps)');
    console.log('-'.repeat(100) + '\n');
    
    const bothTypeRecords = await InfluencerWhaleTransactionsV2.find({
      type: 'both'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
    
    console.log(`Found ${bothTypeRecords.length} records with type="both"\n`);
    
    if (bothTypeRecords.length > 0) {
      console.log('Recent "both" type records (may be split swaps stored incorrectly):');
      bothTypeRecords.forEach((record, idx) => {
        console.log(`\n${idx + 1}. Signature: ${record.signature}`);
        console.log(`   Type: ${record.type}`);
        console.log(`   Classification Source: ${record.classificationSource || 'N/A'}`);
        console.log(`   Created At: ${record.createdAt}`);
        
        // Check if classification source indicates split swap
        if (record.classificationSource && record.classificationSource.includes('split')) {
          console.log(`   ⚠️  WARNING: This is a split swap stored as "both" - needs migration!`);
        }
      });
    }
    
    // Method 4: Statistics
    console.log('\n' + '='.repeat(100));
    console.log('STATISTICS');
    console.log('='.repeat(100) + '\n');
    
    const stats = await InfluencerWhaleTransactionsV2.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    console.log('Records by type:');
    stats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} records`);
    });
    
    const totalRecords = await InfluencerWhaleTransactionsV2.countDocuments();
    console.log(`\n   Total records: ${totalRecords}`);
    
    // Check if schema has compound unique index
    console.log('\n' + '='.repeat(100));
    console.log('SCHEMA CHECK');
    console.log('='.repeat(100) + '\n');
    
    const indexes = await InfluencerWhaleTransactionsV2.collection.getIndexes();
    console.log('Current indexes:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`   ${indexName}: ${JSON.stringify(indexes[indexName])}`);
    });
    
    // Check if compound unique index exists
    const hasCompoundIndex = Object.keys(indexes).some(name => 
      name.includes('signature') && name.includes('type')
    );
    
    if (hasCompoundIndex) {
      console.log('\n✅ Compound unique index (signature, type) exists');
      console.log('   Split swaps can be stored as separate records');
    } else {
      console.log('\n⚠️  No compound unique index found');
      console.log('   Current schema may not support split swap storage');
      console.log('   Check if signature has unique constraint');
      
      const hasUniqueSignature = Object.values(indexes).some(index => 
        index.key && index.key.signature === 1 && index.unique === true
      );
      
      if (hasUniqueSignature) {
        console.log('   ❌ Signature has unique constraint - prevents split swap storage');
        console.log('   Schema needs to be updated before deployment');
      }
    }
    
    console.log('\n' + '='.repeat(100));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkAllSplitSwapsInInfluencer();
