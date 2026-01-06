/**
 * Final fix: Update Telegram connection directly
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function fixTelegram() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Update directly using MongoDB
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Remove Telegram from old user
    await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId('69433a09c66bd9e99c9c60dc') },
      { $unset: { telegramChatId: "" } }
    );

    // Add Telegram to new user
    await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId('695caab996612f706c3ad96b') },
      { $set: { telegramChatId: '8519526605' } }
    );

    console.log('✅ Fixed!\n');

    // Verify
    const newUser = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId('695caab996612f706c3ad96b') });
    console.log(`New user Telegram: ${newUser.telegramChatId}\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixTelegram();
