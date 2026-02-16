require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const users = await db.collection('users').countDocuments();
  const telegramUsers = await db
    .collection('users')
    .countDocuments({
      telegramChatId: { $exists: true, $ne: null, $ne: '' },
    });
  const alerts = await db.collection('useralerts').countDocuments();
  const enabledAlerts = await db
    .collection('useralerts')
    .countDocuments({ enabled: true });

  console.log('Users (total):', users);
  console.log('Telegram users:', telegramUsers);
  console.log('Alerts (total):', alerts);
  console.log('Alerts (enabled):', enabledAlerts);
  await mongoose.disconnect();
})();
