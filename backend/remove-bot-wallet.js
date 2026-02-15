// Remove bot wallet from tracking
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const BOT_WALLET = 'CcM9FGcjo7hS1ZoiCXxM6cUVfiGrDV3qMDYGCbdmmSWj';

async function removeBotWallet() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const WhaleGroup = mongoose.model('WhaleGroup', new mongoose.Schema({}, { strict: false, collection: 'whalegroups' }));

    // Find which group contains this wallet
    const groups = await WhaleGroup.find({
      wallets: {
        $elemMatch: { address: BOT_WALLET }
      }
    });

    if (groups.length === 0) {
      console.log('❌ Wallet not found in any group');
      await mongoose.disconnect();
      return;
    }

    console.log(`📍 Found wallet in ${groups.length} group(s):\n`);

    for (const group of groups) {
      console.log(`Group: ${group.name}`);
      console.log(`Current wallet count: ${group.wallets.length}`);
      
      // Remove the wallet
      const result = await WhaleGroup.updateOne(
        { _id: group._id },
        { $pull: { wallets: { address: BOT_WALLET } } }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Removed wallet from group: ${group.name}`);
        
        // Get updated count
        const updatedGroup = await WhaleGroup.findById(group._id);
        console.log(`New wallet count: ${updatedGroup.wallets.length}\n`);
      } else {
        console.log(`❌ Failed to remove wallet from group: ${group.name}\n`);
      }
    }

    console.log('✅ Bot wallet removed from tracking');
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

removeBotWallet();
