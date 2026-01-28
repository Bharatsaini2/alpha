#!/usr/bin/env node

/**
 * Check what's in the TokenData cache collection
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Define the schema
const tokenDataSchema = new mongoose.Schema({
  tokenAddress: String,
  imageUrl: String,
  symbol: String,
  name: String,
  lastUpdated: Date,
  createdAt: Date
}, { collection: 'tokendatas' });

const TokenDataModel = mongoose.model('TokenData', tokenDataSchema);

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Token Cache Database Check                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Get total count
  const totalCount = await TokenDataModel.countDocuments();
  console.log(`📊 Total tokens in cache: ${totalCount}\n`);

  // Count by symbol status
  const withSymbol = await TokenDataModel.countDocuments({ symbol: { $ne: null, $exists: true } });
  const withoutSymbol = await TokenDataModel.countDocuments({ $or: [{ symbol: null }, { symbol: { $exists: false } }] });
  const unknownSymbol = await TokenDataModel.countDocuments({ symbol: 'Unknown' });
  const fallbackSymbol = await TokenDataModel.countDocuments({ symbol: { $regex: /\.\.\./ } });

  console.log('📈 Symbol Status:');
  console.log(`   ✅ With valid symbol: ${withSymbol - unknownSymbol - fallbackSymbol}`);
  console.log(`   ❌ With "Unknown": ${unknownSymbol}`);
  console.log(`   ⚠️  With fallback (contains "..."): ${fallbackSymbol}`);
  console.log(`   ⚪ Without symbol: ${withoutSymbol}\n`);

  // Show some examples
  console.log('─'.repeat(80));
  console.log('📝 Sample Entries:\n');

  // Valid symbols
  const validSamples = await TokenDataModel.find({ 
    symbol: { $ne: null, $ne: 'Unknown', $exists: true, $not: /\.\.\./ } 
  }).limit(5).lean();

  if (validSamples.length > 0) {
    console.log('✅ Valid Symbols:');
    validSamples.forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.symbol} (${token.name || 'N/A'})`);
      console.log(`      Address: ${token.tokenAddress}`);
      console.log(`      Updated: ${token.lastUpdated || token.createdAt || 'N/A'}\n`);
    });
  }

  // Unknown symbols
  const unknownSamples = await TokenDataModel.find({ symbol: 'Unknown' }).limit(5).lean();

  if (unknownSamples.length > 0) {
    console.log('❌ "Unknown" Symbols:');
    unknownSamples.forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.symbol}`);
      console.log(`      Address: ${token.tokenAddress}`);
      console.log(`      Updated: ${token.lastUpdated || token.createdAt || 'N/A'}\n`);
    });
  }

  // Fallback symbols
  const fallbackSamples = await TokenDataModel.find({ symbol: { $regex: /\.\.\./ } }).limit(5).lean();

  if (fallbackSamples.length > 0) {
    console.log('⚠️  Fallback Symbols (contains "..."):');
    fallbackSamples.forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.symbol}`);
      console.log(`      Address: ${token.tokenAddress}`);
      console.log(`      Updated: ${token.lastUpdated || token.createdAt || 'N/A'}\n`);
    });
  }

  // Check for your specific tokens
  console.log('─'.repeat(80));
  console.log('🔍 Checking Your Specific Tokens:\n');

  const yourTokens = [
    'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
    '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
  ];

  for (const address of yourTokens) {
    const token = await TokenDataModel.findOne({ tokenAddress: address }).lean();
    if (token) {
      console.log(`✅ Found: ${address}`);
      console.log(`   Symbol: ${token.symbol || 'N/A'}`);
      console.log(`   Name: ${token.name || 'N/A'}`);
      console.log(`   Updated: ${token.lastUpdated || token.createdAt || 'N/A'}\n`);
    } else {
      console.log(`❌ Not found: ${address}\n`);
    }
  }

  console.log('─'.repeat(80));
  console.log('\n💡 Analysis:');
  
  if (unknownSymbol > 0) {
    console.log(`   ⚠️  Found ${unknownSymbol} tokens with "Unknown" symbol`);
    console.log('   → These are poisoning the cache!');
    console.log('   → Should be cleaned up or re-fetched\n');
  }
  
  if (fallbackSymbol > 0) {
    console.log(`   ⚠️  Found ${fallbackSymbol} tokens with fallback symbols (contains "...")`);
    console.log('   → These should not be in the cache!');
    console.log('   → Should be cleaned up\n');
  }

  if (unknownSymbol === 0 && fallbackSymbol === 0) {
    console.log('   ✅ Cache is clean! No "Unknown" or fallback symbols found\n');
  }

  console.log('✅ Check Complete!');

  await mongoose.disconnect();
}

main().catch(console.error);
