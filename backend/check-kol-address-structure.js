// Check the structure of KOL addresses
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkKolStructure() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const InfluencerWallet = mongoose.model('InfluencerWallet', new mongoose.Schema({}, { strict: false, collection: 'influencerwhalesaddressv2' }));
    
    const sample = await InfluencerWallet.findOne().lean();
    
    if (!sample) {
      console.log('❌ No KOL addresses found');
      await mongoose.disconnect();
      return;
    }

    console.log('📄 Sample KOL address document:\n');
    console.log(JSON.stringify(sample, null, 2));
    
    console.log('\n📋 Available fields:');
    Object.keys(sample).forEach(key => {
      console.log(`  - ${key}: ${typeof sample[key]}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkKolStructure();
