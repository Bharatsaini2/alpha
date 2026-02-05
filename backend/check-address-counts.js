/**
 * Quick check of address counts in collections
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkAddressCounts() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Check Whale Addresses
    console.log('📊 WHALE ADDRESSES:');
    console.log('Collection: whalesaddresses');
    const whaleCollection = db.collection('whalesaddresses');
    const whales = await whaleCollection.find({}).toArray();
    const totalWhaleAddresses = whales.reduce((sum, doc) => sum + (doc.whalesAddress?.length || 0), 0);
    console.log(`Total documents: ${whales.length}`);
    console.log(`Total addresses: ${totalWhaleAddresses}`);
    
    // Sample addresses
    if (whales.length > 0 && whales[0].whalesAddress) {
      console.log(`Sample addresses (first 3):`);
      whales[0].whalesAddress.slice(0, 3).forEach((addr, i) => {
        console.log(`  ${i + 1}. ${addr}`);
      });
    }

    // Check Influencer Addresses
    console.log('\n📊 INFLUENCER/KOL ADDRESSES:');
    console.log('Collection: influencerwhalesaddressv2');
    const kolCollection = db.collection('influencerwhalesaddressv2');
    const kols = await kolCollection.find({}).toArray();
    const totalKolAddresses = kols.reduce((sum, doc) => sum + (doc.whalesAddress?.length || 0), 0);
    console.log(`Total documents: ${kols.length}`);
    console.log(`Total addresses: ${totalKolAddresses}`);
    
    // Sample addresses
    if (kols.length > 0 && kols[0].whalesAddress) {
      console.log(`Sample addresses (first 3):`);
      kols[0].whalesAddress.slice(0, 3).forEach((addr, i) => {
        console.log(`  ${i + 1}. ${addr}`);
      });
      if (kols[0].influencerName) {
        console.log(`  Influencer: ${kols[0].influencerName}`);
      }
    }

    // Check specific test address
    console.log('\n🔍 Checking test address: ByiAbN9MJhfQKGK5WJrfgko6XS88qqERQVRLWZTsvyTf');
    const testAddr = 'ByiAbN9MJhfQKGK5WJrfgko6XS88qqERQVRLWZTsvyTf';
    
    const inWhales = await whaleCollection.findOne({ whalesAddress: testAddr });
    const inKols = await kolCollection.findOne({ whalesAddress: testAddr });
    
    console.log(`In whalesaddresses: ${inWhales ? '✅ YES' : '❌ NO'}`);
    console.log(`In influencerwhalesaddressv2: ${inKols ? '✅ YES' : '❌ NO'}`);

    console.log('\n📋 SUMMARY:');
    console.log(`Expected whale addresses: 4000+`);
    console.log(`Actual whale addresses: ${totalWhaleAddresses}`);
    console.log(`Match: ${totalWhaleAddresses >= 4000 ? '✅' : '❌'}`);
    console.log(`\nExpected KOL addresses: 400+`);
    console.log(`Actual KOL addresses: ${totalKolAddresses}`);
    console.log(`Match: ${totalKolAddresses >= 400 ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkAddressCounts();
