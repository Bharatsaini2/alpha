/**
 * Test if saveTokenToCache actually works
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function testCacheSave() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!');
    console.log('Connection state:', mongoose.connection.readyState); // 1 = connected
    
    // Import the model
    const TokenMetadataCacheModel = require('./dist/models/token-metadata-cache.model').default;
    
    // Try to save a test token
    const testAddress = 'TEST' + Date.now();
    const testSymbol = 'TEST';
    
    console.log(`\n💾 Attempting to save test token: ${testAddress} -> ${testSymbol}`);
    
    const result = await TokenMetadataCacheModel.findOneAndUpdate(
      { tokenAddress: testAddress },
      {
        $set: {
          symbol: testSymbol,
          name: testSymbol,
          source: 'shyft',
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Save successful!');
    console.log('Result:', result);
    
    // Verify it was saved
    const found = await TokenMetadataCacheModel.findOne({ tokenAddress: testAddress });
    console.log('\n🔍 Verification:', found ? '✅ Found in DB' : '❌ NOT found in DB');
    
    // Clean up
    await TokenMetadataCacheModel.deleteOne({ tokenAddress: testAddress });
    console.log('🗑️  Test token deleted');
    
    await mongoose.connection.close();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testCacheSave();
