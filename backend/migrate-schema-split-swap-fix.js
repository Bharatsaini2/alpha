/**
 * Schema Migration: Split Swap Storage Architecture Fix
 * 
 * Purpose: Update database schema to allow multiple records per signature
 * 
 * Changes:
 * 1. Remove unique constraint on signature field
 * 2. Add compound unique index on (signature, type)
 * 3. Verify existing queries still work
 * 
 * Requirements: 3.1, 3.2, 3.3
 * Task: Phase A, Task 1
 */

const mongoose = require('mongoose')
require('dotenv').config()

const MONGO_URI = process.env.MONGO_URI

if (!MONGO_URI) {
  console.error('❌ Error: MONGO_URI environment variable is not defined')
  console.error('Please ensure .env file exists with MONGO_URI set')
  process.exit(1)
}

async function migrateSchema() {
  console.log('🔧 Starting schema migration for split swap fix...\n')
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    const collection = db.collection('whalealltransactionsv2')
    
    // Step 1: Check existing indexes
    console.log('📋 Step 1: Checking existing indexes...')
    const existingIndexes = await collection.indexes()
    console.log('Current indexes:')
    existingIndexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`)
    })
    console.log()
    
    // Step 2: Drop old unique index on signature if it exists
    console.log('🗑️  Step 2: Removing old unique constraint on signature...')
    try {
      const signatureIndex = existingIndexes.find(idx => 
        idx.key.signature === 1 && idx.unique === true && Object.keys(idx.key).length === 1
      )
      
      if (signatureIndex) {
        await collection.dropIndex(signatureIndex.name)
        console.log(`✅ Dropped old unique index: ${signatureIndex.name}`)
      } else {
        console.log('ℹ️  No old unique signature index found (may have been already removed)')
      }
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Old unique signature index not found (already removed or never existed)')
      } else {
        throw error
      }
    }
    console.log()
    
    // Step 3: Create compound unique index on (signature, type)
    console.log('🔨 Step 3: Creating compound unique index on (signature, type)...')
    try {
      await collection.createIndex(
        { signature: 1, type: 1 },
        { 
          unique: true, 
          name: 'signature_type_unique',
          background: true // Create in background to avoid blocking
        }
      )
      console.log('✅ Created compound unique index: signature_type_unique')
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        console.log('ℹ️  Compound unique index already exists')
      } else {
        throw error
      }
    }
    console.log()
    
    // Step 4: Create regular index on signature (for queries)
    console.log('🔨 Step 4: Creating regular index on signature...')
    try {
      await collection.createIndex(
        { signature: 1 },
        { 
          name: 'signature_1',
          background: true
        }
      )
      console.log('✅ Created regular index: signature_1')
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        console.log('ℹ️  Regular signature index already exists')
      } else {
        throw error
      }
    }
    console.log()
    
    // Step 5: Verify new indexes
    console.log('✅ Step 5: Verifying new indexes...')
    const updatedIndexes = await collection.indexes()
    console.log('Updated indexes:')
    updatedIndexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`)
    })
    console.log()
    
    // Step 6: Test query performance
    console.log('🧪 Step 6: Testing query performance...')
    
    // Test 1: Query by signature (should still work)
    const testSignature = await collection.findOne({}, { projection: { signature: 1 } })
    if (testSignature) {
      const start1 = Date.now()
      await collection.findOne({ signature: testSignature.signature })
      const time1 = Date.now() - start1
      console.log(`  ✅ Query by signature: ${time1}ms`)
    }
    
    // Test 2: Query by signature and type (should use compound index)
    const testRecord = await collection.findOne({}, { projection: { signature: 1, type: 1 } })
    if (testRecord) {
      const start2 = Date.now()
      await collection.findOne({ signature: testRecord.signature, type: testRecord.type })
      const time2 = Date.now() - start2
      console.log(`  ✅ Query by signature + type: ${time2}ms`)
    }
    
    // Test 3: Count records by type (should still work)
    const start3 = Date.now()
    const buyCount = await collection.countDocuments({ type: 'buy' })
    const sellCount = await collection.countDocuments({ type: 'sell' })
    const bothCount = await collection.countDocuments({ type: 'both' })
    const time3 = Date.now() - start3
    console.log(`  ✅ Count by type: ${time3}ms (buy: ${buyCount}, sell: ${sellCount}, both: ${bothCount})`)
    console.log()
    
    // Step 7: Check for duplicate signatures with same type (should be none)
    console.log('🔍 Step 7: Checking for duplicate (signature, type) combinations...')
    const duplicates = await collection.aggregate([
      {
        $group: {
          _id: { signature: '$signature', type: '$type' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).toArray()
    
    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate (signature, type) combinations:`)
      duplicates.slice(0, 5).forEach(dup => {
        console.log(`  - Signature: ${dup._id.signature}, Type: ${dup._id.type}, Count: ${dup.count}`)
      })
      console.log('\n⚠️  WARNING: Duplicates found! These need to be resolved before the compound unique index can work properly.')
    } else {
      console.log('✅ No duplicate (signature, type) combinations found')
    }
    console.log()
    
    console.log('✅ Schema migration completed successfully!\n')
    console.log('📝 Summary:')
    console.log('  - Removed old unique constraint on signature')
    console.log('  - Added compound unique index on (signature, type)')
    console.log('  - Added regular index on signature for queries')
    console.log('  - Verified existing queries still work')
    console.log('  - Database is now ready for split swap records\n')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Disconnected from MongoDB')
  }
}

// Run migration
if (require.main === module) {
  migrateSchema()
    .then(() => {
      console.log('\n✅ Migration script completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error)
      process.exit(1)
    })
}

module.exports = { migrateSchema }
